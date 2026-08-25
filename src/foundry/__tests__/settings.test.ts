/**
 * @fileoverview Tests for world settings methods and handlers.
 */

import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
vi.mock('socket.io-client');
vi.mock('../auth.js', () => ({
  authenticateFoundry: vi
    .fn()
    .mockResolvedValue({ session: 'test-session', userId: 'test-user-id' }),
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

function baseWorldData() {
  return {
    userId: 'test-user-id',
    world: { id: 'w', title: 'Test World' },
    system: { id: 'cyberpunk-red-core', version: '0.92.4' },
    release: { version: '12.331' },
    actors: [],
    scenes: [],
    items: [],
    journal: [],
    messages: [],
    combats: [],
    users: [],
    activeUsers: [],
    settings: [
      {
        _id: 'settingAAAAAAAA1',
        key: 'cyberpunk-red-core.combatTimer',
        value: '{"seconds":30,"autoEnd":true}',
      },
    ],
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
          maybeAck({ result: [{ _id: 'settingAAAAAAAA2', ...doc }] });
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
    userId: 'test-user-id',
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
  harness.fire('session', { userId: 'test-user-id' });
  await connecting;

  return { client, ...harness };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('FoundryClient world settings', () => {
  it('reads setting by key and parses JSON value', async () => {
    const { client } = await connectClient();
    const result = client.getWorldSetting('cyberpunk-red-core.combatTimer');
    expect(result.exists).toBe(true);
    expect(result.value).toEqual({ seconds: 30, autoEnd: true });

    const missing = client.getWorldSetting('some-module.missing');
    expect(missing.exists).toBe(false);
    expect(missing.value).toBeUndefined();
  });

  it('refuses writes to the core.* namespace', async () => {
    const { client } = await connectClient();
    await expect(client.setWorldSetting('core.something', 1)).rejects.toThrow(/Refusing to write a core\.\* setting/);
  });

  it('rejects malformed setting key without scope', async () => {
    const { client } = await connectClient();
    await expect(client.setWorldSetting('invalidkey', 1)).rejects.toThrow(/must have format {scope}\.{field}/);
  });

  it('emits serialized JSON string when creating/updating settings', async () => {
    const { client, socket } = await connectClient();
    const result = await client.setWorldSetting('cyberpunk-red-core.foo', { a: 1 });

    expect(result.created).toBe(true);
    expect(result.value).toEqual({ a: 1 });
    expect(result.previous).toBeUndefined();

    const modifyCall = socket.emit.mock.calls.findLast(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { data: Array<Record<string, unknown>> } };
    expect(req.operation.data[0]).toMatchObject({
      key: 'cyberpunk-red-core.foo',
      value: '{"a":1}',
    });
  });

  it('reports previous value on update of existing setting', async () => {
    const { client } = await connectClient();
    const result = await client.setWorldSetting('cyberpunk-red-core.combatTimer', { seconds: 45 });
    expect(result.created).toBe(false);
    expect(result.previous).toEqual({ seconds: 30, autoEnd: true });
    expect(result.value).toEqual({ seconds: 45 });
  });
});
