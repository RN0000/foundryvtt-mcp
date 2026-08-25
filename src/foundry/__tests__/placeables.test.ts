/**
 * @fileoverview Tests for placeable documents (lights, sounds, notes, drawings, templates).
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
const JOURNAL_ID = 'journalAAAAAAAAA';

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
      },
    ],
    items: [],
    journal: [{ _id: JOURNAL_ID, name: 'Rules Lore', pages: [] }],
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

describe('FoundryClient placeables', () => {
  describe('AmbientLight', () => {
    it('centers light in cell with gridCol/gridRow and nests config', async () => {
      const { client, socket } = await connectClient();
      await client.createLight(SCENE_ID, {
        gridCol: 3,
        gridRow: 5,
        dim: 30,
        bright: 10,
        color: '#ff8800',
      });

      const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
      const req = modifyCall?.[1] as { operation: { data: Array<Record<string, unknown>> } };
      expect(req.operation.data[0]).toMatchObject({
        x: 350, // 3 * 100 + 50
        y: 550, // 5 * 100 + 50
        config: {
          dim: 30,
          bright: 10,
          color: '#ff8800',
        },
      });

      const listed = client.listLights(SCENE_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ x: 350, y: 550, dim: 30, bright: 10, color: '#ff8800' });
    });

    it('rejects invalid color format', async () => {
      const { client } = await connectClient();
      await expect(client.createLight(SCENE_ID, { x: 0, y: 0, color: 'blue' })).rejects.toThrow(/Invalid color format/);
    });

    it('updates and deletes a light', async () => {
      const { client } = await connectClient();
      const light = (await client.createLight(SCENE_ID, { x: 100, y: 100, dim: 5 })) as { _id: string };
      await client.updateLight(SCENE_ID, light._id, { dim: 10 });
      expect(client.listLights(SCENE_ID)[0]?.dim).toBe(10);
      await client.deleteLight(SCENE_ID, light._id);
      expect(client.listLights(SCENE_ID)).toHaveLength(0);
    });
  });

  describe('AmbientSound', () => {
    it('creates and lists sounds', async () => {
      const { client } = await connectClient();
      const sound = (await client.createSound(SCENE_ID, 'assets/audio/rain.mp3', {
        gridCol: 1,
        gridRow: 1,
        radius: 20,
        volume: 0.8,
      })) as { _id: string };

      const listed = client.listSounds(SCENE_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        x: 150,
        y: 150,
        path: 'assets/audio/rain.mp3',
        radius: 20,
        volume: 0.8,
      });

      await client.deleteSound(SCENE_ID, sound._id);
      expect(client.listSounds(SCENE_ID)).toHaveLength(0);
    });
  });

  describe('Note', () => {
    it('requires entryId or text', async () => {
      const { client } = await connectClient();
      await expect(client.createNote(SCENE_ID, { x: 0, y: 0 })).rejects.toThrow(/needs entryId.*or text/);
    });

    it('validates journal entry exists if entryId given', async () => {
      const { client } = await connectClient();
      await expect(client.createNote(SCENE_ID, { x: 0, y: 0, entryId: 'missingJournalAA' })).rejects.toThrow(/Journal entry not found/);
    });

    it('creates note with text or valid entryId', async () => {
      const { client } = await connectClient();
      const note = (await client.createNote(SCENE_ID, {
        gridCol: 2,
        gridRow: 2,
        entryId: JOURNAL_ID,
        text: 'Secret Stash',
      })) as { _id: string };

      const listed = client.listNotes(SCENE_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        x: 250,
        y: 250,
        entryId: JOURNAL_ID,
        text: 'Secret Stash',
      });

      await client.deleteNote(SCENE_ID, note._id);
      expect(client.listNotes(SCENE_ID)).toHaveLength(0);
    });
  });

  describe('Drawing', () => {
    it('validates shape requirements', async () => {
      const { client } = await connectClient();
      await expect(client.createDrawing(SCENE_ID, { shape: 'r', x: 0, y: 0 })).rejects.toThrow(/width and height are required/);
      await expect(client.createDrawing(SCENE_ID, { shape: 'c', x: 0, y: 0 })).rejects.toThrow(/radius.*required/);
      await expect(client.createDrawing(SCENE_ID, { shape: 'p', x: 0, y: 0, points: [0, 0, 10] })).rejects.toThrow(/at least 6 coordinates/);
    });

    it('creates and lists drawings with author attached', async () => {
      const { client, socket } = await connectClient();
      const drawing = (await client.createDrawing(SCENE_ID, {
        shape: 'c',
        x: 100,
        y: 100,
        radius: 50,
        fillColor: '#336699',
      })) as { _id: string };

      const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
      const req = modifyCall?.[1] as { operation: { data: Array<Record<string, unknown>> } };
      expect(req.operation.data[0]?.author).toBe('test-user-id');
      expect(req.operation.data[0]?.fillType).toBe(1); // Auto solid fill when color given

      const listed = client.listDrawings(SCENE_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ shapeType: 'c', radius: 50, fillColor: '#336699' });

      await client.deleteDrawing(SCENE_ID, drawing._id);
      expect(client.listDrawings(SCENE_ID)).toHaveLength(0);
    });
  });

  describe('MeasuredTemplate', () => {
    it('validates template per-type requirements', async () => {
      const { client } = await connectClient();
      await expect(client.createTemplate(SCENE_ID, { t: 'cone', distance: 10, x: 0, y: 0 })).rejects.toThrow(/direction, and angle are required/);
      await expect(client.createTemplate(SCENE_ID, { t: 'ray', distance: 10, direction: 45, x: 0, y: 0 })).rejects.toThrow(/direction, and width are required/);
      await expect(client.createTemplate(SCENE_ID, { t: 'rect', distance: 10, x: 0, y: 0 })).rejects.toThrow(/direction are required/);
    });

    it('creates circle and cone templates with author attached', async () => {
      const { client, socket } = await connectClient();
      const tmpl = (await client.createTemplate(SCENE_ID, {
        t: 'cone',
        gridCol: 4,
        gridRow: 4,
        distance: 15,
        direction: 90,
        angle: 45,
      })) as { _id: string };

      const modifyCall = socket.emit.mock.calls.find(([event]) => event === 'modifyDocument');
      const req = modifyCall?.[1] as { operation: { data: Array<Record<string, unknown>> } };
      expect(req.operation.data[0]).toMatchObject({
        x: 450,
        y: 450,
        t: 'cone',
        distance: 15,
        direction: 90,
        angle: 45,
        author: 'test-user-id',
      });

      const listed = client.listTemplates(SCENE_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ t: 'cone', distance: 15, direction: 90, angle: 45 });

      await client.deleteTemplate(SCENE_ID, tmpl._id);
      expect(client.listTemplates(SCENE_ID)).toHaveLength(0);
    });
  });
});
