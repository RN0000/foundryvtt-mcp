import { BridgeTransport } from './transport.js';
import { captureScene } from './commands/capture-scene.js';
import { getDocumentSchema } from './commands/get-schema.js';
import { searchCompendiumContent } from './commands/search-compendium-content.js';
import { getCompendiumDocument } from './commands/get-compendium-document.js';
import { rollAndPost } from './commands/roll-and-post.js';
import { setTarget } from './commands/set-target.js';
import { getTargets } from './commands/get-targets.js';
import { pingCanvas } from './commands/ping-canvas.js';
import { setPause } from './commands/set-pause.js';
import { uploadAsset } from './commands/upload-asset.js';

const MODULE_ID = 'foundryvtt-mcp-bridge';

/** @type {Record<string, (params: Record<string, unknown>) => Promise<unknown>>} */
const COMMANDS = {
  capture_scene: () => captureScene(),
  get_document_schema: (params) => getDocumentSchema(params),
  search_compendium_content: (params) => searchCompendiumContent(params),
  get_compendium_document: (params) => getCompendiumDocument(params),
  roll_and_post: (params) => rollAndPost(params),
  set_target: (params) => setTarget(params),
  get_targets: () => getTargets(),
  ping_canvas: (params) => pingCanvas(params),
  set_pause: (params) => setPause(params),
  upload_asset: (params) => uploadAsset(params),
};

/** @type {BridgeTransport | null} */
let transport = null;

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'bridgePort', {
    name: 'MCP Bridge Port',
    hint: 'Port the foundryvtt-mcp server is listening on for the module bridge (FOUNDRY_MODULE_BRIDGE_PORT).',
    scope: 'world',
    config: true,
    type: Number,
    default: 31415,
  });
});

Hooks.once('ready', () => {
  // GM-only: canvas commands run against this client's own render, and only
  // the GM's client is guaranteed connected/active.
  if (!game.user?.isGM) return;

  const port = game.settings.get(MODULE_ID, 'bridgePort');
  transport = new BridgeTransport(`ws://localhost:${port}`, async (type, params) => {
    const handler = COMMANDS[type];
    if (!handler) {
      throw new Error(`Unknown command: ${type}`);
    }
    return handler(params);
  });
  transport.connect();

  // Pushed unsolicited (no outstanding request) so `watch_events` on the
  // server sees canvas targeting, which never crosses FoundryVTT's own
  // `modifyDocument` Socket.IO channel.
  Hooks.on('targetToken', (user, token, targeted) => {
    transport?.sendEvent('target_token', {
      userId: user?.id,
      userName: user?.name,
      tokenId: token?.id,
      tokenName: token?.document?.name ?? token?.name,
      sceneId: token?.scene?.id ?? canvas?.scene?.id,
      targeted: !!targeted,
    });
  });
});

Hooks.once('closeGame', () => {
  transport?.disconnect();
});
