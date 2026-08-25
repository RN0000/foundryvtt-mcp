/**
 * Toggles or sets the game pause state.
 *
 * @param {{ paused?: boolean }} params
 */
export async function setPause(params) {
  const { paused } = params;
  const target = paused !== undefined ? Boolean(paused) : !game.paused;
  await game.togglePause(target, true);
  return { paused: game.paused };
}
