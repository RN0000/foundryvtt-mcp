/**
 * @fileoverview Tests for token listing (`listTokens`), the `modifyDocument`
 * cache self-patch (#new: a write's own effect is visible to reads on the
 * same connection without a manual refreshWorldData()), and
 * `moveTokenPathfind`'s exact-destination fix (a blocked route now lands the
 * token on the requested pixel, not the destination grid cell's corner).
 *
 * Mirrors scene-tiles.test.ts / wall-mutations.test.ts's mock-socket harness.
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
const ACTOR_ID = 'actorAAAAAAAAAAA';
const TOKEN_ID = 'tokenAAAAAAAAAAA';
const WALL_ID = 'wallAAAAAAAAAAAA';

/**
 * One scene, grid size 100, with a partial-height wall at x=200 (y 0-300)
 * leaving the region below y=300 clear to route around. One actor with a
 * prototypeToken, so spawnToken has something to seed from.
 */
function baseWorldData() {
  return {
    userId: 'test-user-id',
    world: { id: 'w', title: 'Test World' },
    system: { id: 'cyberpunk-red-core', version: '0.92.4' },
    release: { version: '12.331' },
    actors: [
      {
        _id: ACTOR_ID,
        name: 'Goblin',
        type: 'npc',
        system: {},
        prototypeToken: { width: 1, height: 1 },
      },
    ],
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
        walls: [{ _id: WALL_ID, c: [200, 0, 200, 300], door: 0, ds: 0, move: 1 }],
        tiles: [],
        tokens: [],
      },
    ],
    items: [],
    journal: [],
    messages: [],
    combats: [],
    users: [],
    activeUsers: [],
    settings: [],
    macros: [],
    playlists: [],
    tables: [],
    folders: [],
  };
}

/** Shape of the mock Socket.IO client built by {@link buildMockSocket}. */
interface MockSocket {
  connected: boolean;
  on: Mock;
  once: Mock;
  off: Mock;
  emit: Mock;
  disconnect: Mock;
}

/** Mock socket supporting the 'world' handshake ack and 'modifyDocument' acks. */
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
        // Real FoundryVTT: echoes exactly what was requested back as the
        // result, and never re-broadcasts the write to the originating
        // socket - this harness intentionally does neither, so any local
        // visibility of the write comes only from modifyDocument()'s own
        // cache self-patch, not from a broadcast this mock never sends.
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
          maybeAck({ result: [{ _id: TOKEN_ID, ...doc }] });
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

describe('FoundryClient.listTokens', () => {
  it('reads tokens from the cached scene, defaulting missing fields', async () => {
    const { client } = await connectClient();
    const worldData = client.getWorldData();
    const scene = worldData?.scenes.find((s) => (s as { _id: string })._id === SCENE_ID) as {
      tokens: unknown[];
    };
    scene.tokens.push({
      _id: TOKEN_ID,
      name: 'Goblin',
      actorId: ACTOR_ID,
      actorLink: true,
      x: 50,
      y: 60,
      width: 1,
      height: 1,
      hidden: false,
      disposition: -1,
    });

    expect(client.listTokens(SCENE_ID)).toEqual([
      {
        id: TOKEN_ID,
        name: 'Goblin',
        actorId: ACTOR_ID,
        actorLink: true,
        x: 50,
        y: 60,
        width: 1,
        height: 1,
        elevation: 0,
        rotation: 0,
        hidden: false,
        disposition: -1,
      },
    ]);
  });

  it('throws for an unknown scene', async () => {
    const { client } = await connectClient();
    expect(() => client.listTokens('missingSceneAAAA')).toThrow(/Scene not found/);
  });
});

describe('modifyDocument cache self-patch (write visible without refreshWorldData)', () => {
  it('spawnToken makes the new token immediately visible to listTokens/findToken', async () => {
    const { client } = await connectClient();

    expect(client.listTokens(SCENE_ID)).toHaveLength(0);

    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 60)) as { _id: string };

    // No refreshWorldData() call in between - this only passes if
    // modifyDocument() patched the cache itself.
    const listed = client.listTokens(SCENE_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created._id);
    expect(listed[0]?.x).toBe(50);
    expect(listed[0]?.y).toBe(60);
    expect(client.findToken(created._id)?.token.x).toBe(50);
  });

  it('moveToken updates the cached token position in place', async () => {
    const { client } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 60)) as { _id: string };

    await client.moveToken(SCENE_ID, created._id, 400, 500);

    const listed = client.listTokens(SCENE_ID);
    expect(listed[0]?.x).toBe(400);
    expect(listed[0]?.y).toBe(500);
  });

  it('deleteToken removes the token from the cache', async () => {
    const { client } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 60)) as { _id: string };
    expect(client.listTokens(SCENE_ID)).toHaveLength(1);

    await client.deleteToken(SCENE_ID, created._id);

    expect(client.listTokens(SCENE_ID)).toHaveLength(0);
    expect(client.findToken(created._id)).toBeNull();
  });
});

describe('moveTokenPathfind exact-destination fix', () => {
  it('lands on the exact requested (x, y) when the route is blocked, not the grid-cell corner', async () => {
    const { client } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 50)) as { _id: string };

    // Direct line from (50,50) to (250,50) crosses the wall at x=200
    // (y 0-300), forcing the A* branch. floor(250/100)*100 = 200,
    // floor(50/100)*100 = 0 - the old behavior landed on that grid corner
    // (200, 0) instead of the requested pixel.
    const result = await client.moveTokenPathfind(SCENE_ID, created._id, 250, 50);

    expect(result.blocked).toBe(false);
    const last = result.path.at(-1);
    expect(last).toEqual({ x: 250, y: 50 });
    expect(client.listTokens(SCENE_ID)[0]).toMatchObject({ x: 250, y: 50 });
  });

  it('still takes the direct single-waypoint path when nothing blocks it', async () => {
    const { client } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 50)) as { _id: string };

    // (50,50) -> (50,900): stays on the wall's side (x < 200), never blocked.
    const result = await client.moveTokenPathfind(SCENE_ID, created._id, 50, 900);

    expect(result.blocked).toBe(false);
    expect(result.path).toEqual([{ x: 50, y: 900 }]);
  });
});

describe('updateTokenVision', () => {
  it('emits dot-paths for sight and light settings and sets sight.enabled if sightRange > 0', async () => {
    const { client, socket } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 50)) as { _id: string };

    await client.updateTokenVision(SCENE_ID, created._id, {
      sightRange: 30,
      lightDim: 15,
      lightColor: '#ff8800',
    });

    const modifyCall = socket.emit.mock.calls.findLast(([event]) => event === 'modifyDocument');
    const req = modifyCall?.[1] as { operation: { updates: Array<Record<string, unknown>> } };
    expect(req.operation.updates[0]).toMatchObject({
      _id: created._id,
      'sight.enabled': true,
      'sight.range': 30,
      'light.dim': 15,
      'light.color': '#ff8800',
    });
  });

  it('rejects empty patch or invalid color', async () => {
    const { client } = await connectClient();
    const created = (await client.spawnToken(SCENE_ID, ACTOR_ID, 50, 50)) as { _id: string };
    await expect(client.updateTokenVision(SCENE_ID, created._id, {})).rejects.toThrow(
      /patch is required/,
    );
    await expect(
      client.updateTokenVision(SCENE_ID, created._id, { lightColor: 'invalid' }),
    ).rejects.toThrow(/Invalid lightColor format/);
  });
});
