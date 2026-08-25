/**
 * @fileoverview Chat message mutation tool handler
 *
 * WRITE operation — requires FOUNDRY_WRITE_ENABLED=true and an active
 * Socket.IO connection (mutations use the core `modifyDocument` protocol).
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { withToolError } from './utils.js';

/**
 * Handles posting a message to the FoundryVTT chat log, optionally as a
 * named speaker, whispered to specific users, and/or styled as in-character
 * or an emote.
 */
export async function handleSendChatMessage(
  args: {
    content: string;
    speaker?: string;
    whisperTo?: string[];
    style?: 'ooc' | 'ic' | 'emote';
  },
  foundryClient: FoundryClient,
) {
  const { content, speaker, whisperTo, style } = args;

  if (!content || typeof content !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'content is required and must be a string');
  }
  if (whisperTo !== undefined && !Array.isArray(whisperTo)) {
    throw new McpError(ErrorCode.InvalidParams, 'whisperTo must be an array of user ids');
  }

  return withToolError('send chat message', async () => {
    const options: { speaker?: string; whisperTo?: string[]; style?: 'ooc' | 'ic' | 'emote' } = {};
    if (speaker) {
      options.speaker = speaker;
    }
    if (whisperTo && whisperTo.length > 0) {
      options.whisperTo = whisperTo;
    }
    if (style) {
      options.style = style;
    }
    const message = await foundryClient.sendChatMessage(content, options);

    const audience =
      whisperTo && whisperTo.length > 0 ? `whispered to ${whisperTo.length} user(s)` : 'public';

    return {
      content: [
        {
          type: 'text',
          text: `💬 **Chat Message Sent**
**Speaker:** ${speaker ?? '(default)'}
**Audience:** ${audience}
**Style:** ${style ?? 'other'}
**ID:** ${message._id}`,
        },
      ],
    };
  });
}
