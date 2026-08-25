/**
 * Lists the current target selections of all users on the active canvas.
 */
export async function getTargets() {
  const users = [];
  for (const user of game.users ?? []) {
    const targets = Array.from(user.targets ?? []);
    if (targets.length > 0) {
      users.push({
        userId: user.id,
        userName: user.name,
        tokenIds: targets.map((t) => t.id),
        tokenNames: targets.map((t) => t.document?.name ?? t.name),
      });
    }
  }
  return { users };
}
