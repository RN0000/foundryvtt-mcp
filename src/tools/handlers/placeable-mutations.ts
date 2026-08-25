/**
 * @fileoverview Placeable document mutation tool handlers (lights, sounds, notes, drawings, templates).
 *
 * All are WRITE operations — require FOUNDRY_WRITE_ENABLED=true and an active Socket.IO connection.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { resolveSceneId } from './scenes.js';
import { withToolError } from './utils.js';

// ============================================================================
// AmbientLight handlers
// ============================================================================

export async function handleCreateLight(
  args: {
    sceneId?: string;
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    dim?: number;
    bright?: number;
    color?: string;
    angle?: number;
    rotation?: number;
    animationType?: string;
    animationSpeed?: number;
    animationIntensity?: number;
    walls?: boolean;
    vision?: boolean;
    hidden?: boolean;
  },
  foundryClient: FoundryClient,
) {
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('create light', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    const created = (await foundryClient.createLight(sceneId, args)) as { _id?: string } | undefined;
    const lightId = created?._id ?? 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: `💡 **Ambient Light Created**\n**ID:** ${lightId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})\n**Dim Radius:** ${args.dim ?? 0}, **Bright Radius:** ${args.bright ?? 0}${args.color ? `, **Color:** ${args.color}` : ''}`,
        },
      ],
    };
  });
}

export async function handleUpdateLight(
  args: {
    lightId: string;
    sceneId?: string;
    x?: number;
    y?: number;
    dim?: number;
    bright?: number;
    color?: string;
    angle?: number;
    rotation?: number;
    walls?: boolean;
    vision?: boolean;
    hidden?: boolean;
  },
  foundryClient: FoundryClient,
) {
  const { lightId } = args;
  if (!lightId || typeof lightId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'lightId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('update light', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.updateLight(sceneId, lightId, args);

    return {
      content: [
        {
          type: 'text',
          text: `💡 **Ambient Light Updated**\n**ID:** ${lightId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}

export async function handleDeleteLight(
  args: { lightId: string; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { lightId } = args;
  if (!lightId || typeof lightId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'lightId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('delete light', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.deleteLight(sceneId, lightId);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 **Ambient Light Deleted**\n**ID:** ${lightId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}

// ============================================================================
// AmbientSound handlers
// ============================================================================

export async function handleCreateSound(
  args: {
    path: string;
    sceneId?: string;
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    radius?: number;
    volume?: number;
    repeat?: boolean;
    walls?: boolean;
    easing?: boolean;
    hidden?: boolean;
  },
  foundryClient: FoundryClient,
) {
  const { path } = args;
  if (!path || typeof path !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'path is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('create sound', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    const created = (await foundryClient.createSound(sceneId, path, args)) as { _id?: string } | undefined;
    const soundId = created?._id ?? 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: `🔊 **Ambient Sound Created**\n**ID:** ${soundId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})\n**Path:** \`${path}\`\n**Radius:** ${args.radius ?? 0}px, **Volume:** ${args.volume ?? 0.5}`,
        },
      ],
    };
  });
}

export async function handleDeleteSound(
  args: { soundId: string; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { soundId } = args;
  if (!soundId || typeof soundId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'soundId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('delete sound', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.deleteSound(sceneId, soundId);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 **Ambient Sound Deleted**\n**ID:** ${soundId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}

// ============================================================================
// Note handlers
// ============================================================================

export async function handleCreateNote(
  args: {
    sceneId?: string;
    entryId?: string;
    pageId?: string;
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    text?: string;
    iconSize?: number;
    fontSize?: number;
    textAnchor?: number;
    global?: boolean;
  },
  foundryClient: FoundryClient,
) {
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('create note', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    const created = (await foundryClient.createNote(sceneId, args)) as { _id?: string } | undefined;
    const noteId = created?._id ?? 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: `📌 **Map Note Created**\n**ID:** ${noteId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})${args.text ? `\n**Label:** "${args.text}"` : ''}${args.entryId ? `\n**Journal Entry:** ${args.entryId}` : ''}`,
        },
      ],
    };
  });
}

export async function handleDeleteNote(
  args: { noteId: string; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { noteId } = args;
  if (!noteId || typeof noteId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'noteId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('delete note', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.deleteNote(sceneId, noteId);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 **Map Note Deleted**\n**ID:** ${noteId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}

// ============================================================================
// Drawing handlers
// ============================================================================

export async function handleCreateDrawing(
  args: {
    shape?: 'r' | 'c' | 'e' | 'p';
    x: number;
    y: number;
    sceneId?: string;
    width?: number;
    height?: number;
    radius?: number;
    points?: number[];
    rotation?: number;
    strokeColor?: string;
    strokeWidth?: number;
    fillType?: 0 | 1 | 2;
    fillColor?: string;
    fillAlpha?: number;
    text?: string;
    fontSize?: number;
    hidden?: boolean;
    locked?: boolean;
  },
  foundryClient: FoundryClient,
) {
  if (typeof args.x !== 'number' || !Number.isFinite(args.x) || typeof args.y !== 'number' || !Number.isFinite(args.y)) {
    throw new McpError(ErrorCode.InvalidParams, 'x and y are required and must be finite numbers');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('create drawing', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    const created = (await foundryClient.createDrawing(sceneId, args)) as { _id?: string } | undefined;
    const drawingId = created?._id ?? 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: `🎨 **Drawing Created**\n**ID:** ${drawingId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})\n**Shape:** ${args.shape ?? 'r'} at (${args.x}, ${args.y})${args.text ? `\n**Text:** "${args.text}"` : ''}`,
        },
      ],
    };
  });
}

export async function handleDeleteDrawing(
  args: { drawingId: string; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { drawingId } = args;
  if (!drawingId || typeof drawingId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'drawingId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('delete drawing', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.deleteDrawing(sceneId, drawingId);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 **Drawing Deleted**\n**ID:** ${drawingId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}

// ============================================================================
// MeasuredTemplate handlers
// ============================================================================

export async function handleCreateTemplate(
  args: {
    distance: number;
    sceneId?: string;
    t?: 'circle' | 'cone' | 'rect' | 'ray';
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    direction?: number;
    angle?: number;
    width?: number;
    borderColor?: string;
    fillColor?: string;
    hidden?: boolean;
  },
  foundryClient: FoundryClient,
) {
  if (typeof args.distance !== 'number' || !Number.isFinite(args.distance) || args.distance < 0) {
    throw new McpError(ErrorCode.InvalidParams, 'distance is required and must be a finite non-negative number');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('create template', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    const created = (await foundryClient.createTemplate(sceneId, args)) as { _id?: string } | undefined;
    const templateId = created?._id ?? 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: `📐 **Measured Template Created**\n**ID:** ${templateId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})\n**Type:** ${args.t ?? 'circle'}, **Distance:** ${args.distance} grid units`,
        },
      ],
    };
  });
}

export async function handleDeleteTemplate(
  args: { templateId: string; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { templateId } = args;
  if (!templateId || typeof templateId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'templateId is required and must be a string');
  }
  const sceneId = resolveSceneId(args.sceneId, foundryClient);

  return withToolError('delete template', async () => {
    const scene = foundryClient.getScenes().find((s) => s._id === sceneId);
    await foundryClient.deleteTemplate(sceneId, templateId);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 **Measured Template Deleted**\n**ID:** ${templateId}\n**Scene:** ${scene?.name ?? sceneId} (${sceneId})`,
        },
      ],
    };
  });
}
