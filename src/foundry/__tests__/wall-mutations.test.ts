/**
 * @fileoverview Tests for wall creation (`createWall`, `deleteWall`, `listWalls`).
 *
 * Mirrors scene-tiles.test.ts's mock-socket harness — no PNG fixtures needed
 * here since walls carry no image asset.
 */

import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Shape of the mock Socket.IO client built by {@link buildMockSocket}. */
interface MockSocket {
  connected: boolean;
  on: Mock;
  once: Mock;
  off: Mock;
  emit: Mock;
  disconnect: Mock;
}

vi.mock('axios');
vi.mock('socket.io-client');
vi.mock('../auth.js', () => ({
  authenticateFoundry: vi
    .fn()
    .mockResolvedValue({ session: 'test-session', userId: 'test-user-id' }),
  sessionSocketOptions: (session: string) => ({
    transports: ['websocket'],
    query: { session },
    extraHeaders: { Cookie: `session=${session}` },
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
const WALL_ID = 'wallAAAAAAAAAAAA';
const NEW_WALL_ID = 'wallBBBBBBBBBBBB';

/** One scene, grid size 100, with a single pre-existing wall. */
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
        walls: [{ _id: WALL_ID, c: [200, 0, 200, 1000], door: 0, ds: 0, move: 1, sight: 1 }],
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

/** Mock socket supporting the 'world' handshake ack and 'modifyDocument' acks. */
function buildMockSocket(worldData: Record<string, unknown>): {
  socket: MockSocket;
  listeners: Map<string, Array<(...args: unknown[]) => void>>;
  fire: (event: string, ...args: unknown[]) => void;
  queueModifyResponse: (result: unknown[]) => void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const modifyResponses: unknown[] = [];
  const socket = {
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
        const response = modifyResponses.shift() ?? { result: [{}] };
        maybeAck(response);
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
  /** Queues the next `modifyDocument` ack response (create/update/delete result). */
  const queueModifyResponse = (result: unknown[]) => {
    modifyResponses.push({ result });
  };
  return { socket, listeners, fire, queueModifyResponse };
}

describe('FoundryClient wall creation', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  async function connectClient() {
    const { io } = await import('socket.io-client');
    const { authenticateFoundry } = await import('../auth.js');
    // afterEach's resetAllMocks() clears the module-factory resolved value.
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

  /** Reads the `data`/`updates` array of the most recent `modifyDocument` emit. */
  function lastModifyRequest(socket: MockSocket) {
    const call = socket.emit.mock.calls.findLast(([event]) => event === 'modifyDocument');
    return call?.[1] as { operation: { data?: unknown[]; updates?: unknown[]; ids?: unknown[] } };
  }

  describe('createWall', () => {
    it('places a wall at explicit pixel endpoints', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID, c: [0, 0, 500, 0], door: 0, ds: 0 }]);

      const wall = (await client.createWall(SCENE_ID, {
        x1: 0,
        y1: 0,
        x2: 500,
        y2: 0,
      })) as { _id: string };

      expect(wall._id).toBe(NEW_WALL_ID);
      const request = lastModifyRequest(socket);
      expect(request.operation.data?.[0]).toMatchObject({ c: [0, 0, 500, 0] });
    });

    it('snaps fromCol/fromRow -> toCol/toRow to grid vertices', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      // Grid size 100: vertex (3,5) -> (4,5) is the one-cell top edge of
      // cell (3,5), pixel line (300, 500) -> (400, 500).
      await client.createWall(SCENE_ID, { fromCol: 3, fromRow: 5, toCol: 4, toRow: 5 });

      const request = lastModifyRequest(socket);
      expect(request.operation.data?.[0]).toMatchObject({ c: [300, 500, 400, 500] });
    });

    it('defaults to a plain solid wall with no door/sight fields set', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0 });

      const request = lastModifyRequest(socket);
      const data = request.operation.data?.[0] as Record<string, unknown>;
      expect(data.door).toBeUndefined();
      expect(data.sight).toBeUndefined();
    });

    it('sets door: 1, ds: 0 for type "door"', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0, type: 'door' });

      const request = lastModifyRequest(socket);
      expect(request.operation.data?.[0]).toMatchObject({ door: 1, ds: 0 });
    });

    it('sets door: 2, ds: 0 for type "secretDoor"', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0, type: 'secretDoor' });

      const request = lastModifyRequest(socket);
      expect(request.operation.data?.[0]).toMatchObject({ door: 2, ds: 0 });
    });

    it('sets sight: 0 (see-through) for type "invisible", leaving door/move unset', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0, type: 'invisible' });

      const request = lastModifyRequest(socket);
      const data = request.operation.data?.[0] as Record<string, unknown>;
      expect(data.sight).toBe(0);
      expect(data.door).toBeUndefined();
      expect(data.move).toBeUndefined();
    });

    it('sets sight: 10 (LIMITED, second-crossing) for type "terrain"', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0, type: 'terrain' });

      const request = lastModifyRequest(socket);
      const data = request.operation.data?.[0] as Record<string, unknown>;
      expect(data.sight).toBe(10);
      expect(data.move).toBeUndefined();
    });

    it('sets move: 0 (passable) for type "ethereal", leaving sight blocking by default', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([{ _id: NEW_WALL_ID }]);

      await client.createWall(SCENE_ID, { x1: 0, y1: 0, x2: 100, y2: 0, type: 'ethereal' });

      const request = lastModifyRequest(socket);
      const data = request.operation.data?.[0] as Record<string, unknown>;
      expect(data.move).toBe(0);
      expect(data.sight).toBeUndefined();
    });

    it('rejects a zero-length wall', async () => {
      const { client } = await connectClient();
      await expect(
        client.createWall(SCENE_ID, { x1: 100, y1: 100, x2: 100, y2: 100 }),
      ).rejects.toThrow(/endpoints must differ/);
    });

    it('requires either x1/y1/x2/y2 or fromCol/fromRow/toCol/toRow', async () => {
      const { client } = await connectClient();
      await expect(client.createWall(SCENE_ID, {})).rejects.toThrow(
        /Either x1\/y1\/x2\/y2 or fromCol\/fromRow\/toCol\/toRow/,
      );
    });

    it('rejects an invalid wall type', async () => {
      const { client } = await connectClient();
      await expect(
        client.createWall(SCENE_ID, {
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 0,
          type: 'moat' as unknown as 'wall',
        }),
      ).rejects.toThrow(/Invalid wall type/);
    });

    it('rejects an invalid sceneId format', async () => {
      const { client } = await connectClient();
      await expect(
        client.createWall('not-an-id', { x1: 0, y1: 0, x2: 100, y2: 0 }),
      ).rejects.toThrow(/Invalid sceneId format/);
    });

    it('throws when the scene does not exist', async () => {
      const { client } = await connectClient();
      await expect(
        client.createWall('sceneZZZZZZZZZZZ', { x1: 0, y1: 0, x2: 100, y2: 0 }),
      ).rejects.toThrow(/Scene not found/);
    });
  });

  describe('deleteWall / listWalls', () => {
    it('lists walls from the cached scene', async () => {
      const { client } = await connectClient();
      const walls = client.listWalls(SCENE_ID);
      expect(walls).toEqual([
        {
          id: WALL_ID,
          x1: 200,
          y1: 0,
          x2: 200,
          y2: 1000,
          move: 1,
          sight: 1,
          door: 0,
          ds: 0,
        },
      ]);
    });

    it('defaults missing sight/move to 1 (blocking) when absent from the raw record', async () => {
      const { client } = await connectClient();
      const worldData = client.getWorldData();
      const scene = worldData?.scenes.find((s) => (s as { _id: string })._id === SCENE_ID) as {
        walls: unknown[];
      };
      scene.walls.push({ _id: NEW_WALL_ID, c: [0, 0, 100, 0], door: 0, ds: 0 });

      const walls = client.listWalls(SCENE_ID);
      const bare = walls.find((w) => w.id === NEW_WALL_ID);
      expect(bare).toMatchObject({ move: 1, sight: 1 });
    });

    it('deletes a wall via modifyDocument', async () => {
      const { client, socket, queueModifyResponse } = await connectClient();
      queueModifyResponse([WALL_ID]);

      await expect(client.deleteWall(SCENE_ID, WALL_ID)).resolves.toBeUndefined();

      const request = lastModifyRequest(socket);
      expect(request.operation.ids).toEqual([WALL_ID]);
    });

    it('rejects an invalid wallId format on delete', async () => {
      const { client } = await connectClient();
      await expect(client.deleteWall(SCENE_ID, 'short')).rejects.toThrow(/Invalid wallId format/);
    });
  });
});
