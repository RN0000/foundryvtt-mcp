/**
 * Emits a canvas ping animation at the given (x, y) coordinates.
 *
 * @param {{ x: number; y: number; sceneId?: string }} params
 */
export async function pingCanvas(params) {
  const { x, y, sceneId } = params;
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('x and y coordinates are required and must be numbers');
  }
  if (!canvas?.ready) {
    throw new Error('Canvas is not ready');
  }
  if (sceneId && canvas.scene?.id !== sceneId) {
    throw new Error(
      `Cannot ping scene ${sceneId}: canvas is currently viewing ${canvas.scene?.id ?? 'no scene'}`,
    );
  }

  await canvas.ping({ x, y });
  return { x, y, sceneId: canvas.scene?.id };
}
