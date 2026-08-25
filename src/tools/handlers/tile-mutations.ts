/**
 * @fileoverview Tile mutation tool handlers
 *
 * WRITE operations — require FOUNDRY_WRITE_ENABLED=true and an active
 * Socket.IO connection (mutations use the core `modifyDocument` protocol).
 * `Tile` is an embedded document of `Scene` (mirrors token mutation handlers).
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { withToolError } from './utils.js';

/**
 * Handles placing a decorative Tile on a scene.
 */
export async function handleCreateTile(
  args: {
    sceneId: string;
    src: string;
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    width?: number;
    height?: number;
    rotation?: number;
    elevation?: number;
    hidden?: boolean;
    allowWallOverlap?: boolean;
  },
  foundryClient: FoundryClient,
) {
  const { sceneId, src, ...options } = args;

  if (!sceneId || typeof sceneId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'sceneId is required and must be a string');
  }
  if (!src || typeof src !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'src is required and must be a string');
  }

  return withToolError('create tile', async () => {
    const tile = (await foundryClient.createTile(sceneId, src, options)) as {
      _id?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    return {
      content: [
        {
          type: 'text',
          text: `🧱 **Tile Placed**\n**Image:** ${src.split('/').pop()}\n**ID:** ${tile._id}\n**Position:** (${tile.x}, ${tile.y})\n**Size:** ${tile.width}x${tile.height}px`,
        },
      ],
    };
  });
}

/**
 * Handles removing a Tile from a scene.
 */
export async function handleDeleteTile(
  args: { sceneId: string; tileId: string },
  foundryClient: FoundryClient,
) {
  const { sceneId, tileId } = args;

  if (!sceneId || typeof sceneId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'sceneId is required and must be a string');
  }
  if (!tileId || typeof tileId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'tileId is required and must be a string');
  }

  return withToolError('delete tile', async () => {
    await foundryClient.deleteTile(sceneId, tileId);
    return {
      content: [
        {
          type: 'text',
          text: `🗑️ **Tile Removed**\n**ID:** ${tileId}`,
        },
      ],
    };
  });
}
