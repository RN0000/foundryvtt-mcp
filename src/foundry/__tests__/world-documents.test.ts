/**
 * @fileoverview Tests for world documents (folders, macros, playlists, roll tables).
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
        } else if (Array.isArray(op?.data)) {
          maybeAck({ result: op.data.map((d, i) => ({ _id: `docAAAAAAAAAAAA${i}`, ...d })) });
        } else {
          const doc = op?.updates?.[0] ?? {};
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

describe('FoundryClient world documents', () => {
  describe('RollTable', () => {
    it('creates table with auto-assigned sequential ranges and matching 1dN formula', async () => {
      const { client, socket } = await connectClient();
      const results = [{ text: 'Result 1' }, { text: 'Result 2' }, { text: 'Result 3' }];
      await client.createRollTable('Loot Table', results);

      const modifyCalls = socket.emit.mock.calls.filter(([event]) => event === 'modifyDocument');
      const tableCreate = modifyCalls[0]?.[1] as { operation: { data: Array<Record<string, unknown>> } };
      expect(tableCreate.operation.data[0]).toMatchObject({
        name: 'Loot Table',
        formula: '1d3',
      });

      const resultsCreate = modifyCalls[1]?.[1] as {
        type: string;
        operation: { data: Array<Record<string, unknown>>; parentUuid: string };
      };
      expect(resultsCreate.type).toBe('TableResult');
      expect(resultsCreate.operation.data).toEqual([
        { type: 'text', text: 'Result 1', weight: 1, range: [1, 1] },
        { type: 'text', text: 'Result 2', weight: 1, range: [2, 2] },
        { type: 'text', text: 'Result 3', weight: 1, range: [3, 3] },
      ]);
    });

    it('rejects mixing explicit and absent ranges', async () => {
      const { client } = await connectClient();
      const results = [
        { text: 'Result 1', range: [1, 5] as [number, number] },
        { text: 'Result 2' },
      ];
      await expect(client.createRollTable('Bad Table', results)).rejects.toThrow(
        /mixing explicit and auto-assigned ranges produces gaps/,
      );
    });

    it('deletes a roll table', async () => {
      const { client } = await connectClient();
      await expect(client.deleteRollTable('tableAAAAAAAAAAA')).resolves.toBeUndefined();
    });
  });

  describe('Folder', () => {
    it('creates and lists folders with type validation', async () => {
      const { client } = await connectClient();
      await expect(client.createFolder('Bad Folder', 'InvalidType')).rejects.toThrow(/Invalid folder type/);

      const folder = (await client.createFolder('NPCs', 'Actor', { color: '#ff0000' })) as { _id: string };
      expect(client.listFolders()).toHaveLength(1);
      expect(client.listFolders({ type: 'Actor' })[0]).toMatchObject({
        id: folder._id,
        name: 'NPCs',
        type: 'Actor',
        color: '#ff0000',
      });
      expect(client.listFolders({ type: 'Item' })).toHaveLength(0);
    });
  });

  describe('Macro', () => {
    it('creates and lists macros with author attached and command preview', async () => {
      const { client, socket } = await connectClient();
      const macro = (await client.createMacro('Say Hi', 'chat', '/ooc Hello World!\nSecond Line')) as {
        _id: string;
      };

      const modifyCall = socket.emit.mock.calls.findLast(([event]) => event === 'modifyDocument');
      const req = modifyCall?.[1] as { operation: { data: Array<Record<string, unknown>> } };
      expect(req.operation.data[0]?.author).toBe('test-user-id');

      const listed = client.listMacros();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: macro._id,
        name: 'Say Hi',
        type: 'chat',
        commandPreview: '/ooc Hello World! Second Line',
      });

      await client.deleteMacro(macro._id);
      expect(client.listMacros()).toHaveLength(0);
    });
  });

  describe('Playlist', () => {
    it('creates playlist with tracks and updates state', async () => {
      const { client, socket } = await connectClient();
      const playlist = (await client.createPlaylist('Combat BGM', {
        mode: 1, // shuffle
        sounds: [
          { name: 'Battle 1', path: 'assets/audio/b1.mp3' },
          { name: 'Battle 2', path: 'assets/audio/b2.mp3' },
        ],
      })) as { _id: string };

      const listed = client.listPlaylists();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: playlist._id,
        name: 'Combat BGM',
        mode: 1,
        soundCount: 2,
      });

      await client.setPlaylistState(playlist._id, true);
      expect(client.listPlaylists()[0]?.playing).toBe(true);

      await client.deletePlaylist(playlist._id);
      expect(client.listPlaylists()).toHaveLength(0);
    });
  });
});
