/**
 * @fileoverview World settings tool handlers.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { withToolError } from './utils.js';

export async function handleGetWorldSetting(
  args: { key: string },
  foundryClient: FoundryClient,
) {
  const { key } = args;
  if (!key || typeof key !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'key is required and must be a string');
  }

  return withToolError('get world setting', async () => {
    const setting = foundryClient.getWorldSetting(key);
    if (!setting.exists) {
      return {
        content: [
          {
            type: 'text',
            text: `⚙️ **World Setting: \`${key}\`**\n**Status:** Not set in world database (using system/module default value).`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `⚙️ **World Setting: \`${key}\`**\n**Value:** \`\`\`json\n${JSON.stringify(setting.value, null, 2)}\n\`\`\``,
        },
      ],
    };
  });
}

export async function handleSetWorldSetting(
  args: { key: string; value: unknown },
  foundryClient: FoundryClient,
) {
  const { key, value } = args;
  if (!key || typeof key !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'key is required and must be a string');
  }

  return withToolError('set world setting', async () => {
    const result = await foundryClient.setWorldSetting(key, value);
    const prevText =
      result.previous !== undefined
        ? `\n**Previous Value:** \`\`\`json\n${JSON.stringify(result.previous, null, 2)}\n\`\`\``
        : '\n**Previous Value:** _(not previously set in world database)_';

    return {
      content: [
        {
          type: 'text',
          text: `⚙️ **World Setting Updated**\n**Key:** \`${result.key}\`\n**Action:** ${result.created ? 'Created' : 'Updated'}\n**New Value:** \`\`\`json\n${JSON.stringify(result.value, null, 2)}\n\`\`\`${prevText}`,
        },
      ],
    };
  });
}
