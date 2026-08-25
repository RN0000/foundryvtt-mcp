/**
 * @fileoverview Tests for Scene Region client methods (FoundryVTT v12+).
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

const SCENE_ID = 'sceneAAAAAAAAAAA';

function baseWorldData() {
  return {
    userId: 'test-user-id',
    world: { id: 'w', title: 'Test World' },
    system: { id: 'cyberpunk-red-core', version: '0.92.4' },
    release: { version: '12.331' },
    actors: [],
    scenes: [
      {
        _id: SCENE_ID,
        name: 'Test Scene',
        active: true,
        navigation: true,
        width: 1000,
        height: 1000,
        padding: 0.25,
        darkness: 0,
        globalLight: false,
        grid: { type: 1, size: 100, distance: 1, units: 'ft' },
        walls: [],
        tiles: [],
        tokens: [],
        lights: [],
        sounds: [],
        notes: [],
        drawings: [],
        templates: [],
        regions: [],
      },
    ],
    items: [],
    journal: [],
    messages: [],
    combats: [],
    users: [],
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
          maybeAck({ result: [{ _id: 'regionAAAAAAAAAA', ...doc }] });
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

describe('FoundryClient — Scene Regions', () => {
  it('emits a Region create with the correct type, parentUuid, and mapped shape', async () => {
    const { client, socket } = await connectClient();
    await client.createRegion(SCENE_ID, {
      name: 'Trap Zone',
      color: '#ff0000',
      shapes: [{ type: 'rectangle', x: 100, y: 100, width: 200, height: 200 }],
    });

    const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
    if (!modifyCall) {
      throw new Error('modifyDocument was never emitted');
    }
    const [type, req] = modifyCall as [
      string,
      { type: string; operation: { parentUuid: string; data: Array<Record<string, unknown>> } },
    ];
    expect(type).toBe('modifyDocument');
    expect(req.type).toBe('Region');
    expect(req.operation.parentUuid).toBe(`Scene.${SCENE_ID}`);
    expect(req.operation.data[0]).toMatchObject({
      name: 'Trap Zone',
      color: '#ff0000',
      shapes: [{ type: 'rectangle', x: 100, y: 100, width: 200, height: 200 }],
    });
  });

  it('rejects an invalid hex color', async () => {
    const { client } = await connectClient();
    await expect(
      client.createRegion(SCENE_ID, { name: 'Bad Color', color: 'red' }),
    ).rejects.toThrow(/Invalid color format/);
  });

  it('rejects a circle shape with a non-positive radius', async () => {
    const { client } = await connectClient();
    await expect(
      client.createRegion(SCENE_ID, {
        name: 'Bad Circle',
        shapes: [{ type: 'circle', x: 0, y: 0, radius: 0 }],
      }),
    ).rejects.toThrow(/circle shape requires/);
  });

  it('rejects a polygon shape with too few points', async () => {
    const { client } = await connectClient();
    await expect(
      client.createRegion(SCENE_ID, {
        name: 'Bad Polygon',
        shapes: [{ type: 'polygon', points: [0, 0, 10, 10] }],
      }),
    ).rejects.toThrow(/polygon shape requires/);
  });

  it('lists and deletes regions', async () => {
    const { client } = await connectClient();
    const created = (await client.createRegion(SCENE_ID, { name: 'Zone' })) as { _id: string };
    const listed = client.listRegions(SCENE_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: 'Zone' });

    await client.deleteRegion(SCENE_ID, created._id);
    expect(client.listRegions(SCENE_ID)).toHaveLength(0);
  });
});
