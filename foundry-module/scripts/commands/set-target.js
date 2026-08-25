/**
 * Sets or clears this GM user's target selection on the active canvas.
 *
 * @param {{ tokenIds?: string[]; targeted?: boolean; replace?: boolean }} params
 */
export async function setTarget(params) {
  const { tokenIds = [], targeted = true, replace = false } = params;
  if (!canvas?.ready || !canvas.tokens) {
    throw new Error('Canvas is not ready');
  }

  if (replace) {
    // Release existing targets first
    for (const token of game.user?.targets ?? []) {
      token.setTarget(false, { user: game.user, releaseOthers: false });
    }
  }

  const missing = [];
  const updated = [];
  for (const id of tokenIds) {
    const token = canvas.tokens.get(id);
    if (!token) {
      missing.push(id);
      continue;
    }
    token.setTarget(targeted, { user: game.user, releaseOthers: false });
    updated.push(token.name);
  }

  if (missing.length > 0) {
    throw new Error(`Tokens not found on canvas: ${missing.join(', ')}`);
  }

  return {
    targeted,
    count: updated.length,
    tokens: updated,
  };
}
