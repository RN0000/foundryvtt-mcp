/**
 * User management tool handler
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import { USER_ROLES } from '../../foundry/types.js';
import { withToolError } from './utils.js';

const ROLE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Player',
  2: 'Trusted Player',
  3: 'Assistant GM',
  4: 'Game Master',
};

export async function handleGetUsers(_args: Record<string, unknown>, foundryClient: FoundryClient) {
  return withToolError('get users', async () => {
    const { users, activeUsers } = foundryClient.getUsers();
    const activeSet = new Set(activeUsers);

    const formatted = users
      .map((u) => {
        const online = activeSet.has(u._id) ? 'Online' : 'Offline';
        const role = ROLE_NAMES[u.role] || `Role ${u.role}`;
        return `- **${u.name}** (${role}) — ${online}`;
      })
      .join('\n');

    const onlineCount = users.filter((u) => activeSet.has(u._id)).length;

    return {
      content: [
        {
          type: 'text',
          text: `**Users** (${onlineCount}/${users.length} online)\n\n${formatted}`,
        },
      ],
    };
  });
}

export async function handleSetUserRole(
  args: { userId: string; role: string },
  foundryClient: FoundryClient,
) {
  const { userId, role } = args;
  if (!userId || typeof userId !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'userId is required and must be a string');
  }
  if (!role || typeof role !== 'string' || !(role in USER_ROLES)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid role "${role}": expected one of ${Object.keys(USER_ROLES).join(', ')}`,
    );
  }

  return withToolError('set user role', async () => {
    const { users } = foundryClient.getUsers();
    const target = users.find((u) => u._id === userId);
    const name = target?.name ?? userId;

    await foundryClient.setUserRole(userId, role as keyof typeof USER_ROLES);

    return {
      content: [
        {
          type: 'text',
          text: `👤 **User Role Updated**\n**User:** ${name} (\`${userId}\`)\n**Role:** ${role}`,
        },
      ],
    };
  });
}
