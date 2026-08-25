/**
 * @fileoverview Tests for placeable tool handlers (scenes.ts list handlers + placeable-mutations.ts).
 */

import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import type { FoundryClient } from '../../../foundry/client.js';
import type { WorldScene } from '../../../foundry/types.js';
import {
  handleCreateDrawing,
  handleCreateLight,
  handleCreateNote,
  handleCreateSound,
  handleCreateTemplate,
  handleDeleteDrawing,
  handleDeleteLight,
  handleDeleteNote,
  handleDeleteSound,
  handleDeleteTemplate,
  handleUpdateLight,
} from '../placeable-mutations.js';
import {
  handleListDrawings,
  handleListLights,
  handleListNotes,
  handleListSounds,
  handleListTemplates,
} from '../scenes.js';

const SCENE_ID = 'sceneAAAAAAAAAAA';

describe('Placeable tool handlers', () => {
  const createMockClient = (opts: {
    scenes?: Array<Pick<WorldScene, '_id' | 'name' | 'active'>>;
    createLight?: (...args: unknown[]) => unknown;
    updateLight?: (...args: unknown[]) => unknown;
    deleteLight?: (...args: unknown[]) => unknown;
    listLights?: (...args: unknown[]) => unknown;
  }): FoundryClient =>
    ({
      getScenes: vi.fn(() => opts.scenes ?? [{ _id: SCENE_ID, name: 'Neon Alley', active: true }]),
      createLight: vi.fn(opts.createLight ?? (() => ({ _id: 'light1' }))),
      updateLight: vi.fn(opts.updateLight ?? (() => ({}))),
      deleteLight: vi.fn(opts.deleteLight ?? (() => undefined)),
      listLights: vi.fn(
        opts.listLights ??
          (() => [
            {
              id: 'light1',
              x: 100,
              y: 200,
              rotation: 0,
              walls: true,
              vision: false,
              hidden: false,
              dim: 30,
              bright: 10,
              color: '#ff8800',
              angle: 360,
              animationType: 'torch',
            },
          ]),
      ),
      listSounds: vi.fn(() => []),
      listNotes: vi.fn(() => []),
      listDrawings: vi.fn(() => []),
      listTemplates: vi.fn(() => []),
      createSound: vi.fn(() => ({ _id: 'sound1' })),
      deleteSound: vi.fn(() => undefined),
      createNote: vi.fn(() => ({ _id: 'note1' })),
      deleteNote: vi.fn(() => undefined),
      createDrawing: vi.fn(() => ({ _id: 'drawing1' })),
      deleteDrawing: vi.fn(() => undefined),
      createTemplate: vi.fn(() => ({ _id: 'template1' })),
      deleteTemplate: vi.fn(() => undefined),
    }) as unknown as FoundryClient;

  it('handleListLights formats light details', async () => {
    const client = createMockClient({});
    const result = await handleListLights({}, client);
    expect(result.content[0].text).toContain('Ambient Lights on Neon Alley');
    expect(result.content[0].text).toContain('light1');
    expect(result.content[0].text).toContain('dim: 30');
    expect(result.content[0].text).toContain('#ff8800');
  });

  it('handleCreateLight delegates to client.createLight with resolved active scene', async () => {
    const client = createMockClient({});
    const result = await handleCreateLight({ dim: 20, bright: 10 }, client);
    expect(client.createLight).toHaveBeenCalledWith(SCENE_ID, { dim: 20, bright: 10 });
    expect(result.content[0].text).toContain('Ambient Light Created');
    expect(result.content[0].text).toContain('light1');
  });

  it('handleUpdateLight delegates and requires lightId', async () => {
    const client = createMockClient({});
    await expect(handleUpdateLight({ lightId: '' }, client)).rejects.toThrow(McpError);
    const result = await handleUpdateLight({ lightId: 'light1', dim: 40 }, client);
    expect(client.updateLight).toHaveBeenCalledWith(SCENE_ID, 'light1', { lightId: 'light1', dim: 40 });
    expect(result.content[0].text).toContain('Ambient Light Updated');
  });

  it('handleDeleteLight delegates and requires lightId', async () => {
    const client = createMockClient({});
    await expect(handleDeleteLight({ lightId: '' }, client)).rejects.toThrow(McpError);
    const result = await handleDeleteLight({ lightId: 'light1' }, client);
    expect(client.deleteLight).toHaveBeenCalledWith(SCENE_ID, 'light1');
    expect(result.content[0].text).toContain('Ambient Light Deleted');
  });

  it('handleCreateSound requires path', async () => {
    const client = createMockClient({});
    await expect(handleCreateSound({ path: '' }, client)).rejects.toThrow(McpError);
    const result = await handleCreateSound({ path: 'sound.mp3' }, client);
    expect(client.createSound).toHaveBeenCalledWith(SCENE_ID, 'sound.mp3', { path: 'sound.mp3' });
    expect(result.content[0].text).toContain('Ambient Sound Created');
  });

  it('handleCreateDrawing requires numeric x and y', async () => {
    const client = createMockClient({});
    await expect(handleCreateDrawing({ x: Number.NaN, y: 0 }, client)).rejects.toThrow(McpError);
    const result = await handleCreateDrawing({ x: 100, y: 100, shape: 'c', radius: 50 }, client);
    expect(client.createDrawing).toHaveBeenCalledWith(SCENE_ID, { x: 100, y: 100, shape: 'c', radius: 50 });
    expect(result.content[0].text).toContain('Drawing Created');
  });

  it('handleCreateTemplate requires numeric distance', async () => {
    const client = createMockClient({});
    await expect(handleCreateTemplate({ distance: Number.NaN }, client)).rejects.toThrow(McpError);
    const result = await handleCreateTemplate({ distance: 10, t: 'circle' }, client);
    expect(client.createTemplate).toHaveBeenCalledWith(SCENE_ID, { distance: 10, t: 'circle' });
    expect(result.content[0].text).toContain('Measured Template Created');
  });
});
