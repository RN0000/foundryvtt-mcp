/**
 * @fileoverview Tests for the watch_events tool handler.
 */

import { describe, expect, it, vi } from 'vitest';
import type { FoundryClient } from '../../../foundry/client.js';
import type { EventReadResult } from '../../../foundry/event-log.js';
import { handleWatchEvents } from '../events.js';

function buildClient(
  result: EventReadResult & { cursorResolvedFrom: 'now' | 'oldest' | 'explicit' },
): FoundryClient {
  return {
    watchEvents: vi.fn(async () => result),
  } as unknown as FoundryClient;
}

describe('handleWatchEvents', () => {
  it('includes nextCursor on a populated result', async () => {
    const client = buildClient({
      events: [
        {
          seq: 42,
          at: Date.now(),
          kind: 'document',
          type: 'ChatMessage',
          action: 'create',
          ids: ['msgAAAAAAAAAAAAA'],
          summary: '💬 Alice: I kick the door open',
        },
      ],
      nextCursor: 42,
      dropped: 0,
      more: false,
      cursorResolvedFrom: 'now',
    });

    const result = await handleWatchEvents({}, client);
    expect(result.content[0].text).toContain('nextCursor:** 42');
    expect(result.content[0].text).toContain('I kick the door open');
  });

  it('includes nextCursor on an empty result', async () => {
    const client = buildClient({
      events: [],
      nextCursor: 41,
      dropped: 0,
      more: false,
      cursorResolvedFrom: 'now',
    });

    const result = await handleWatchEvents({ waitMs: 0 }, client);
    expect(result.content[0].text).toContain('nextCursor:** 41');
    expect(result.content[0].text).toContain('(none)');
  });

  it('surfaces a dropped-events warning', async () => {
    const client = buildClient({
      events: [
        {
          seq: 6,
          at: Date.now(),
          kind: 'document',
          type: 'Actor',
          action: 'update',
          ids: ['actorAAAAAAAAAAA'],
          summary: '🎭 Actor updated',
        },
      ],
      nextCursor: 6,
      dropped: 12,
      more: false,
      cursorResolvedFrom: 'explicit',
    });

    const result = await handleWatchEvents({ cursor: '1' }, client);
    expect(result.content[0].text).toContain('12 events were dropped');
    expect(result.content[0].text).toContain('refresh_world_data');
  });

  it('clamps waitMs and limit before calling the client', async () => {
    const client = buildClient({
      events: [],
      nextCursor: 0,
      dropped: 0,
      more: false,
      cursorResolvedFrom: 'now',
    });

    await handleWatchEvents({ waitMs: 999999, limit: 999 }, client);
    expect(client.watchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ waitMs: 120000, limit: 200 }),
    );

    await handleWatchEvents({ waitMs: -5, limit: 0 }, client);
    expect(client.watchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ waitMs: 0, limit: 1 }),
    );
  });
});
