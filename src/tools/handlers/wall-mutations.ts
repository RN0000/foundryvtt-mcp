/**
 * @fileoverview Wall mutation tool handlers (create/delete a Wall, and the
 * door-specific set_door_state)
 *
 * WRITE operations — require FOUNDRY_WRITE_ENABLED=true and an active
 * Socket.IO connection (mutations use the core `modifyDocument` protocol).
 * `Wall` is an embedded document of `Scene` (mirrors tile mutation handlers);
 * `ds` ("door state") is a plain field on it — no canvas access is required.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient, WallType } from '../../foundry/client.js';
import { withToolError } from './utils.js';

const DOOR_STATE_NAMES: Record<0 | 1 | 2, string> = { 0: 'closed', 1: 'open', 2: 'locked' };

/**
 * Handles opening, closing, or locking a door.
 */
export async function handleSetDoorState(
  args: { wallId: string; state: 0 | 1 | 2; sceneId?: string },
  foundryClient: FoundryClient,
) {
  const { wallId, state, sceneId } = args;

  if (!wallId || typeof wallId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'wallId is required and must be a string');
  }
  if (state !== 0 && state !== 1 && state !== 2) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'state is required and must be 0 (closed), 1 (open), or 2 (locked)',
    );
  }

  const located = foundryClient.findWall(wallId, sceneId);
  if (!located) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Wall not found: ${wallId}${sceneId ? ` on scene ${sceneId}` : ''}`,
    );
  }
  if (located.wall.door === 0) {
    throw new McpError(ErrorCode.InvalidRequest, `Wall ${wallId} is not a door`);
  }

  return withToolError('set door state', async () => {
    await foundryClient.setDoorState(located.scene._id, wallId, state);

    return {
      content: [
        {
          type: 'text',
          text: `🚪 **Door ${DOOR_STATE_NAMES[state]}**
**Wall:** ${wallId}
**Scene:** ${located.scene.name} (${located.scene._id})`,
        },
      ],
    };
  });
}

/**
 * Handles creating a new Wall segment on a scene.
 */
export async function handleCreateWall(
  args: {
    sceneId: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    fromCol?: number;
    fromRow?: number;
    toCol?: number;
    toRow?: number;
    type?: WallType;
  },
  foundryClient: FoundryClient,
) {
  const { sceneId, ...options } = args;

  if (!sceneId || typeof sceneId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'sceneId is required and must be a string');
  }

  return withToolError('create wall', async () => {
    const wall = (await foundryClient.createWall(sceneId, options)) as {
      _id?: string;
      c?: number[];
    };
    const [x1, y1, x2, y2] = wall.c ?? [];
    const type = options.type ?? 'wall';
    const label: Record<WallType, string> = {
      wall: 'Wall',
      door: 'Door',
      secretDoor: 'Secret Door',
      terrain: 'Terrain Wall',
      invisible: 'Invisible Wall',
      ethereal: 'Ethereal Wall',
    };
    return {
      content: [
        {
          type: 'text',
          text: `🧱 **${label[type]} Placed**\n**ID:** ${wall._id}\n**Segment:** (${x1}, ${y1}) → (${x2}, ${y2})`,
        },
      ],
    };
  });
}

/**
 * Handles removing a Wall from a scene.
 */
export async function handleDeleteWall(
  args: { sceneId: string; wallId: string },
  foundryClient: FoundryClient,
) {
  const { sceneId, wallId } = args;

  if (!sceneId || typeof sceneId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'sceneId is required and must be a string');
  }
  if (!wallId || typeof wallId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'wallId is required and must be a string');
  }

  return withToolError('delete wall', async () => {
    await foundryClient.deleteWall(sceneId, wallId);
    return {
      content: [
        {
          type: 'text',
          text: `🗑️ **Wall Removed**\n**ID:** ${wallId}`,
        },
      ],
    };
  });
}
