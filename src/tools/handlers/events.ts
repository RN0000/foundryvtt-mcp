/**
 * World-event tool handler (`watch_events`).
 */

import { config } from '../../config/index.js';
import type { FoundryClient } from '../../foundry/client.js';
import { withToolError } from './utils.js';

/** Clamps `waitMs` into the range the tool description promises. */
function clampWaitMs(value: number | undefined): number {
  const fallback = config.events.defaultWaitMs;
  const raw = value ?? fallback;
  return Math.min(Math.max(raw, 0), 120000);
}

/** Clamps `limit` into the range the tool description promises. */
function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 200);
}

export async function handleWatchEvents(
  args: {
    cursor?: string;
    waitMs?: number;
    limit?: number;
    kinds?: string[];
    types?: string[];
    actions?: string[];
    sceneId?: string;
    excludeSelf?: boolean;
  },
  foundryClient: FoundryClient,
) {
  return withToolError('watch events', async () => {
    const waitMs = clampWaitMs(args.waitMs);
    const limit = clampLimit(args.limit);

    const result = await foundryClient.watchEvents({
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      waitMs,
      limit,
      ...(args.kinds ? { kinds: args.kinds } : {}),
      ...(args.types ? { types: args.types } : {}),
      ...(args.actions ? { actions: args.actions } : {}),
      ...(args.sceneId ? { sceneId: args.sceneId } : {}),
      ...(args.excludeSelf !== undefined ? { excludeSelf: args.excludeSelf } : {}),
    });

    const lines: string[] = [];

    if (result.dropped > 0) {
      lines.push(
        `⚠️ **${result.dropped} events were dropped** before your cursor (buffer holds a limited window). Cached world data may be behind — run \`refresh_world_data\`.`,
        '',
      );
    }

    if (result.events.length === 0) {
      lines.push(
        `👁️ **World Events** (none)`,
        `No world activity in the last ${waitMs}ms.`,
        '',
        `**nextCursor:** ${result.nextCursor} — pass this back as \`cursor\` on the next call.`,
      );
    } else {
      const first = result.events[0];
      const last = result.events[result.events.length - 1];
      lines.push(
        `👁️ **World Events** (${result.events.length} new)`,
        `**Cursor:** ${first ? first.seq - 1 : 0} → ${last?.seq ?? result.nextCursor}`,
        '',
        ...result.events.map((event, index) => `${index + 1}. [${event.seq}] ${event.summary}`),
        '',
        `**nextCursor:** ${result.nextCursor} — pass this back as \`cursor\` on the next call.`,
      );
      if (result.more) {
        lines.push(
          `**more:** true — more matching events are already buffered; call again with this cursor.`,
        );
      }
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  });
}
