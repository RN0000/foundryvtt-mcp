/**
 * @fileoverview Tests for document ownership and user role client methods.
 */

import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
vi.mock('socket.io-client');
vi.mock('../auth.js', () => ({
  authenticateFoundry: vi
    .fn()
    .mockResolvedValue({ session: 'test-session', userId: 'selfuserAAAAAAAA' }),
  sessionSocketOptions: (session: string) => ({
    auth: { session },
    autoConnect: true,
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../config/index.js', () => ({
  config: { logLevel: 'info' },
}));

const { FoundryClient } = await import('../client.js');

const ACTOR_ID = 'actorAAAAAAAAAAA';
const OTHER_USER_ID = 'user0001user0001';
const SELF_USER_ID = 'selfuserAAAAAAAA';

function baseWorldData() {
  return {
    userId: SELF_USER_ID,
    world: { id: 'w', title: 'Test World' },
    system: { id: 'cyberpunk-red-core', version: '0.92.4' },
    release: { version: '12.331' },
    actors: [{ _id: ACTOR_ID, name: 'Vex', type: 'character', system: {} }],
    scenes: [],
    items: [],
    journal: [],
    messages: [],
    combats: [],
    users: [{ _id: SELF_USER_ID, name: 'GM', role: 4, color: '#fff' }],
    activeUsers: [],
    settings: [],
    folders: [],
    macros: [],
    playlists: [],
    tables: [],
    cards: [],
  };
}

interface MockSocket {
  connected: boolean;
  on: Mock;
  once: Mock;
  off: Mock;
  emit: Mock;
  disconnect: Mock;
}

function buildMockSocket(worldData: Record<string, unknown>) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const socket: MockSocket = {
    connected: true,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(handler);
      listeners.set(event, existing);
      return socket;
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(handler);
      listeners.set(event, existing);
      return socket;
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const remaining = (listeners.get(event) ?? []).filter((h) => h !== handler);
      listeners.set(event, remaining);
      return socket;
    }),
    emit: vi.fn((event: string, payloadOrAck?: unknown, maybeAck?: (payload: unknown) => void) => {
      if (event === 'world' && typeof payloadOrAck === 'function') {
        (payloadOrAck as (p: unknown) => void)(worldData);
      } else if (event === 'modifyDocument' && typeof maybeAck === 'function') {
        const op = (
          payloadOrAck as {
            operation?: {
              data?: Array<Record<string, unknown>>;
              updates?: Array<Record<string, unknown>>;
              ids?: string[];
            };
          }
        ).operation;
        if (op?.ids) {
          maybeAck({ result: op.ids });
        } else {
          const doc = op?.data?.[0] ?? op?.updates?.[0] ?? {};
          maybeAck({ result: [{ _id: 'docAAAAAAAAAAAAA', ...doc }] });
        }
      }
      return socket;
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
      return socket;
    }),
  };
  const fire = (event: string, ...args: unknown[]) => {
    for (const handler of [...(listeners.get(event) ?? [])]) {
      handler(...args);
    }
  };
  return { socket, listeners, fire };
}

async function connectClient() {
  const { io } = await import('socket.io-client');
  const { authenticateFoundry } = await import('../auth.js');
  vi.mocked(authenticateFoundry).mockResolvedValue({
    session: 'test-session',
    userId: SELF_USER_ID,
  });
  const harness = buildMockSocket(structuredClone(baseWorldData()));
  vi.mocked(io).mockReturnValue(harness.socket as never);

  const client = new FoundryClient({
    baseUrl: 'http://localhost:30000',
    username: 'gm',
    password: 'secret',
    writeEnabled: true,
  });

  const connecting = client.connect();
  await vi.waitFor(() => expect(harness.listeners.get('session')?.length).toBe(1));
  harness.fire('session', { userId: SELF_USER_ID });
  await connecting;

  return { client, ...harness };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('FoundryClient — setDocumentOwnership', () => {
  it('maps ownership level names to the correct integers', async () => {
    const { client, socket } = await connectClient();
    await client.setDocumentOwnership('Actor', ACTOR_ID, [
      { target: 'default', level: 'none' },
      { target: OTHER_USER_ID, level: 'owner' },
    ]);

    const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { updates: Array<Record<string, unknown>> } };
    expect(req.operation.updates[0]?.ownership).toEqual({
      default: 0,
      [OTHER_USER_ID]: 3,
    });
  });

  it('rejects an invalid ownership level name', async () => {
    const { client } = await connectClient();
    await expect(
      client.setDocumentOwnership('Actor', ACTOR_ID, [
        { target: 'default', level: 'god-mode' as never },
      ]),
    ).rejects.toThrow(/Invalid ownership level/);
  });

  it('rejects an unsupported document type', async () => {
    const { client } = await connectClient();
    await expect(
      client.setDocumentOwnership('ChatMessage' as never, ACTOR_ID, [
        { target: 'default', level: 'owner' },
      ]),
    ).rejects.toThrow(/Invalid documentType/);
  });
});

describe('FoundryClient — setUserRole', () => {
  it('maps role names to the correct integers', async () => {
    const { client, socket } = await connectClient();
    await client.setUserRole(OTHER_USER_ID, 'trusted');

    const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { updates: Array<Record<string, unknown>> } };
    expect(req.operation.updates[0]).toMatchObject({ _id: OTHER_USER_ID, role: 2 });
  });

  it('throws when self-demoting the connected user below assistant', async () => {
    const { client } = await connectClient();
    await expect(client.setUserRole(SELF_USER_ID, 'player')).rejects.toThrow(
      /Cannot demote the connected user/,
    );
  });

  it('allows self-demoting no lower than assistant', async () => {
    const { client, socket } = await connectClient();
    await client.setUserRole(SELF_USER_ID, 'assistant');
    const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { updates: Array<Record<string, unknown>> } };
    expect(req.operation.updates[0]).toMatchObject({ _id: SELF_USER_ID, role: 3 });
  });

  it('allows demoting a different user below assistant', async () => {
    const { client, socket } = await connectClient();
    await client.setUserRole(OTHER_USER_ID, 'none');
    const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { updates: Array<Record<string, unknown>> } };
    expect(req.operation.updates[0]).toMatchObject({ _id: OTHER_USER_ID, role: 0 });
  });
});
