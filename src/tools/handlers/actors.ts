/**
 * @fileoverview Actor management tool handlers
 *
 * Handles searching for actors and retrieving detailed actor information.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { withToolError } from './utils.js';

/**
 * Handles actor search requests
 */
export async function handleSearchActors(
  args: {
    query?: string;
    type?: string;
    limit?: number;
    cursor?: string;
  },
  foundryClient: FoundryClient,
) {
  const { query, type, limit = 10, cursor } = args;

  return withToolError('search actors', async () => {
    const searchParams: { query: string; type?: string; limit: number; cursor?: string } = {
      query: query || '',
      limit,
    };
    if (type) {
      searchParams.type = type;
    }
    if (cursor) {
      searchParams.cursor = cursor;
    }
    const result = await foundryClient.searchActors(searchParams);
    const actorList = result.actors
      .map(
        (actor) =>
          `- **${actor.name}** (${actor.type}) - Level ${actor.level || 'Unknown'} - HP: ${actor.hp?.value || 'Unknown'}/${actor.hp?.max || 'Unknown'}`,
      )
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎭 **Actor Search Results**
**Query:** ${query || 'All actors'}
**Type Filter:** ${type || 'All types'}
**Results:** ${result.actors.length}/${result.total} total

${actorList || 'No actors found matching the criteria.'}

**Page:** ${result.page} | **Limit:** ${result.limit}${result.nextCursor ? `\n\n_More results available. Pass cursor: "${result.nextCursor}" to retrieve the next page._` : ''}`,
        },
      ],
    };
  });
}

/**
 * Handles detailed actor information requests
 */
export async function handleGetActorDetails(
  args: {
    actorId: string;
  },
  foundryClient: FoundryClient,
) {
  const { actorId } = args;

  if (!actorId || typeof actorId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'Actor ID is required and must be a string');
  }

  return withToolError('get actor details', async () => {
    const actor = await foundryClient.getActor(actorId);

    const abilities = actor.abilities
      ? Object.entries(actor.abilities)
          .map(
            ([key, ability]: [string, { value: number; mod: number }]) =>
              `**${key.toUpperCase()}:** ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`,
          )
          .join('\n')
      : 'No ability scores available';

    return {
      content: [
        {
          type: 'text',
          text: `🎭 **Actor Details: ${actor.name}**
**Type:** ${actor.type}
**Level:** ${actor.level || 'Unknown'}
**Hit Points:** ${actor.hp?.value || 'Unknown'}/${actor.hp?.max || 'Unknown'}
**Armor Class:** ${actor.ac?.value || 'Unknown'}

**Ability Scores:**
${abilities}

**Description:** ${(actor as { description?: string }).description || 'No description available.'}`,
        },
      ],
    };
  });
}

/**
 * Handles listing an actor's owned items (equipment, spells, features).
 *
 * Reads full `system` data from the cached worldData, unlike
 * `get_actor_details`, which only reports the actor's own top-level stats.
 */
export async function handleGetActorInventory(
  args: { actorId: string },
  foundryClient: FoundryClient,
) {
  const { actorId } = args;

  if (!actorId || typeof actorId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'actorId is required and must be a string');
  }

  return withToolError('get actor inventory', async () => {
    const items = foundryClient.getActorItems(actorId);

    if (items.length === 0) {
      return {
        content: [{ type: 'text', text: `Actor ${actorId} owns no items.` }],
      };
    }

    const formatted = items
      .map((item) => {
        const qty = item.system.quantity;
        const qtySuffix = typeof qty === 'number' ? ` x${qty}` : '';
        return `- **${item.name}**${qtySuffix} (${item.type}) — ID: ${item._id}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎒 **Actor Inventory** (${items.length} item${items.length !== 1 ? 's' : ''})\n\n${formatted}`,
        },
      ],
    };
  });
}
