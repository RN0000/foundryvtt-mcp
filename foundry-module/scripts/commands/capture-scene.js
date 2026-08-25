/**
 * Screenshots the active scene with a grid coordinate overlay.
 *
 * Ported from alexivenkov/foundry-api-bridge-module (MIT):
 * CaptureSceneHandler.ts + GridOverlay.ts, adapted to plain browser JS.
 */

const MIME_TYPE = 'image/webp';
const QUALITY = 0.8;
const BASE64_PREFIX_PATTERN = /^data:[^;]+;base64,/;
const FONT_SIZE_RATIO = 0.22;
const PADDING_RATIO = 0.05;
const LINE_ALPHA = 0.15;
const TEXT_ALPHA = 0.65;
const STROKE_RATIO = 0.15;
const MIN_STROKE = 2;

function addGridOverlay() {
  const gridSize = canvas.scene.grid.size;
  const dims = canvas.scene.dimensions;
  const fontSize = Math.round(gridSize * FONT_SIZE_RATIO);
  const padding = Math.round(gridSize * PADDING_RATIO);

  const overlay = new PIXI.Container();
  overlay.name = 'ompMcpGridOverlay';

  const startGX = Math.floor(dims.sceneX / gridSize);
  const startGY = Math.floor(dims.sceneY / gridSize);
  const endGX = Math.ceil((dims.sceneX + dims.sceneWidth) / gridSize);
  const endGY = Math.ceil((dims.sceneY + dims.sceneHeight) / gridSize);

  const lines = new PIXI.Graphics();
  lines.lineStyle(1, 0xffffff, LINE_ALPHA);
  for (let gx = startGX; gx <= endGX; gx++) {
    const x = gx * gridSize;
    lines.moveTo(x, dims.sceneY);
    lines.lineTo(x, dims.sceneY + dims.sceneHeight);
  }
  for (let gy = startGY; gy <= endGY; gy++) {
    const y = gy * gridSize;
    lines.moveTo(dims.sceneX, y);
    lines.lineTo(dims.sceneX + dims.sceneWidth, y);
  }
  overlay.addChild(lines);

  const style = new PIXI.TextStyle({
    fontFamily: 'Arial',
    fontSize,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: Math.max(MIN_STROKE, Math.round(fontSize * STROKE_RATIO)),
    letterSpacing: 0,
  });

  for (let gx = startGX; gx < endGX; gx++) {
    for (let gy = startGY; gy < endGY; gy++) {
      const text = new PIXI.Text(`${gx},${gy}`, style);
      text.x = gx * gridSize + padding;
      text.y = gy * gridSize + padding;
      text.alpha = TEXT_ALPHA;
      overlay.addChild(text);
    }
  }

  canvas.stage.addChild(overlay);
  return overlay;
}

function removeGridOverlay(overlay) {
  canvas.stage.removeChild(overlay);
  overlay.destroy({ children: true });
}

/** @returns {Promise<{sceneId: string, sceneName: string, image: string, mimeType: string, width: number, height: number}>} */
export async function captureScene() {
  if (!canvas?.ready || !canvas.scene) {
    throw new Error('Canvas not ready');
  }

  const overlay = addGridOverlay();
  canvas.app.renderer.render(canvas.stage);
  const view = canvas.app.view;
  const dataUrl = view.toDataURL(MIME_TYPE, QUALITY);
  const image = dataUrl.replace(BASE64_PREFIX_PATTERN, '');

  removeGridOverlay(overlay);
  canvas.app.renderer.render(canvas.stage);

  return {
    sceneId: canvas.scene.id,
    sceneName: canvas.scene.name,
    image,
    mimeType: MIME_TYPE,
    width: view.width,
    height: view.height,
  };
}
