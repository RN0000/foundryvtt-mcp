/**
 * @fileoverview Canvas-only tool handlers, relayed through the companion
 * Foundry module over {@link ModuleBridge} rather than FoundryVTT's own
 * Socket.IO document API — see module-bridge.ts for why.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ModuleBridge } from '../../foundry/module-bridge.js';
import { withToolError } from './utils.js';

interface CaptureSceneResult {
  sceneId: string;
  sceneName: string;
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

function isCaptureSceneResult(value: unknown): value is CaptureSceneResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CaptureSceneResult).image === 'string' &&
    typeof (value as CaptureSceneResult).mimeType === 'string'
  );
}

/**
 * Handles capturing a screenshot of the current scene, with a grid
 * coordinate overlay for spatial reasoning. Requires the companion Foundry
 * module to be installed, enabled, and connected to the bridge.
 */
export async function handleCaptureScene(
  _args: Record<string, unknown>,
  moduleBridge: ModuleBridge | null,
) {
  if (!moduleBridge) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'The module bridge is disabled. Set FOUNDRY_MODULE_BRIDGE_ENABLED=true and install the companion Foundry module.',
    );
  }

  return withToolError('capture scene', async () => {
    const result = await moduleBridge.send('capture_scene', {});
    if (!isCaptureSceneResult(result)) {
      throw new McpError(
        ErrorCode.InternalError,
        'Module returned an unexpected capture_scene shape',
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `📷 **Scene Captured: ${result.sceneName}**\n**Dimensions:** ${result.width}x${result.height}`,
        },
        {
          type: 'image',
          data: result.image,
          mimeType: result.mimeType,
        },
      ],
    };
  });
}

interface DocumentSchemaResult {
  documentType: string;
  type: string;
  fields: Record<string, unknown>;
}

function isDocumentSchemaResult(value: unknown): value is DocumentSchemaResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DocumentSchemaResult).documentType === 'string' &&
    typeof (value as DocumentSchemaResult).type === 'string' &&
    typeof (value as DocumentSchemaResult).fields === 'object'
  );
}

/**
 * Handles introspecting a game system's real DataModel schema for an Actor
 * or Item type — the exact field names, types, choices, and defaults
 * `create_world_actor`/`create_actor_item`/`create_full_actor` expect,
 * for whichever system is installed. Requires the companion Foundry module.
 */
export async function handleGetDocumentSchema(
  args: { documentType: 'Actor' | 'Item'; type: string },
  moduleBridge: ModuleBridge | null,
) {
  const { documentType, type } = args;

  if (documentType !== 'Actor' && documentType !== 'Item') {
    throw new McpError(ErrorCode.InvalidParams, 'documentType must be "Actor" or "Item"');
  }
  if (!type || typeof type !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'type is required and must be a string');
  }
  if (!moduleBridge) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'The module bridge is disabled. Set FOUNDRY_MODULE_BRIDGE_ENABLED=true and install the companion Foundry module.',
    );
  }

  return withToolError('get document schema', async () => {
    const result = await moduleBridge.send('get_document_schema', { documentType, type });
    if (!isDocumentSchemaResult(result)) {
      throw new McpError(
        ErrorCode.InternalError,
        'Module returned an unexpected get_document_schema shape',
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `🧬 **${result.documentType} Schema: ${result.type}**\n\`\`\`json\n${JSON.stringify(result.fields, null, 2)}\n\`\`\``,
        },
      ],
    };
  });
}

interface CompendiumContentEntry {
  packId: string;
  packLabel: string;
  documentId: string;
  documentName: string;
  documentType: string;
  matchedIn: 'name' | 'content';
  snippet: string;
}

interface SearchCompendiumContentResult {
  results: CompendiumContentEntry[];
  total: number;
}

function isSearchCompendiumContentResult(value: unknown): value is SearchCompendiumContentResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as SearchCompendiumContentResult).results)
  );
}

export async function handleSearchCompendiumContent(
  args: { query?: string; packType?: string; limit?: number },
  moduleBridge: ModuleBridge | null,
) {
  if (!moduleBridge) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'The module bridge is disabled. Set FOUNDRY_MODULE_BRIDGE_ENABLED=true and install the companion Foundry module.',
    );
  }

  return withToolError('search compendium content', async () => {
    const result = await moduleBridge.send('search_compendium_content', args);
    if (!isSearchCompendiumContentResult(result)) {
      throw new McpError(
        ErrorCode.InternalError,
        'Module returned an unexpected search_compendium_content shape',
      );
    }

    if (result.results.length === 0) {
      return {
        content: [{ type: 'text', text: `📚 **No compendium matches found for "${args.query ?? ''}".**` }],
      };
    }

    const lines = result.results.map((r) => {
      const matchTag = r.matchedIn === 'content' ? ' [content match]' : '';
      const snippetText = r.snippet ? `\n    > "${r.snippet}"` : '';
      return `- **${r.documentName}** (\`${r.documentId}\`) in _${r.packLabel}_ (\`${r.packId}\`)${matchTag}${snippetText}`;
    });

    return {
      content: [
        {
          type: 'text',
          text: `📚 **Compendium Content Matches** (${result.results.length})\n${lines.join('\n')}`,
        },
      ],
    };
  });
}

interface RollAndPostResult {
  formula: string;
  total: number;
  result: string;
}

function isRollAndPostResult(value: unknown): value is RollAndPostResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RollAndPostResult).formula === 'string' &&
    typeof (value as RollAndPostResult).total === 'number'
  );
}

export async function handleRollAndPost(
  args: {
    formula: string;
    flavor?: string;
    speakerAlias?: string;
    whisperTo?: string[];
    rollMode?: string;
  },
  moduleBridge: ModuleBridge | null,
) {
  const { formula } = args;
  if (!formula || typeof formula !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'formula is required and must be a string');
  }
  if (!moduleBridge) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'The module bridge is disabled. Set FOUNDRY_MODULE_BRIDGE_ENABLED=true and install the companion Foundry module.',
    );
  }

  return withToolError('roll and post', async () => {
    const result = await moduleBridge.send('roll_and_post', args);
    if (!isRollAndPostResult(result)) {
      throw new McpError(
        ErrorCode.InternalError,
        'Module returned an unexpected roll_and_post shape',
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `🎲 **Dice Rolled & Posted to Chat**\n**Formula:** ${result.formula}\n**Total:** ${result.total}${args.flavor ? `\n**Flavor:** ${args.flavor}` : ''}`,
        },
      ],
    };
  });
}
