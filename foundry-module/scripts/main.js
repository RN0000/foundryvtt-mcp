import { BridgeTransport } from './transport.js';
import { captureScene } from './commands/capture-scene.js';
import { getDocumentSchema } from './commands/get-schema.js';
import { searchCompendiumContent } from './commands/search-compendium-content.js';
import { getCompendiumDocument } from './commands/get-compendium-document.js';
import { rollAndPost } from './commands/roll-and-post.js';

const MODULE_ID = 'foundryvtt-mcp-bridge';

/** @type {Record<string, (params: Record<string, unknown>) => Promise<unknown>>} */
const COMMANDS = {
  capture_scene: () => captureScene(),
  get_document_schema: (params) => getDocumentSchema(params),
  search_compendium_content: (params) => searchCompendiumContent(params),
  get_compendium_document: (params) => getCompendiumDocument(params),
  roll_and_post: (params) => rollAndPost(params),
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
});

Hooks.once('closeGame', () => {
  transport?.disconnect();
});
