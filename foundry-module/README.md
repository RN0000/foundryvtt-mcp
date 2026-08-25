# FoundryVTT MCP Bridge (Companion Module)

This is the companion FoundryVTT module for the [FoundryVTT MCP Server](https://github.com/RN0000/foundryvtt-mcp).

While the MCP server handles game-state reads and document mutations over Socket.IO, some features require access to the live browser runtime, PIXI canvas, or Foundry's internal JavaScript APIs:

- 📸 **Live Canvas Viewport Screenshots**: `canvas.app.renderer.extract` captures the GM view with burned-in grid coordinates (`[col, row]`) for spatial AI reasoning.
- 🎲 **Interactive Chat Roll Cards**: evaluates `new Roll(formula).evaluate()` and posts authentic, clickable 3D-dice roll cards.
- 📦 **Compendium Deep Search & Document Extraction**: searches pack indices and loads full compendium documents without blocking the main socket loop.
- 📑 **DataModel Schema Introspection**: dynamically introspects `CONFIG.Actor.dataModels` and `CONFIG.Item.dataModels` for exact field schemas.

---

## 📦 Installation in FoundryVTT

1. Copy the `foundry-module` directory into your FoundryVTT `Data/modules/` folder:

   ```bash
   # Windows
   cp -r foundry-module "%LOCALAPPDATA%/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

   # macOS
   cp -r foundry-module "~/Library/Application Support/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

   # Linux
   cp -r foundry-module "~/.local/share/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"
   ```

2. Launch your FoundryVTT world.
3. Open **Game Settings** → **Manage Modules**.
4. Enable **FoundryVTT MCP Bridge**.

---

## ⚙️ Module Settings

In FoundryVTT under **Configure Settings** → **Module Settings** → **FoundryVTT MCP Bridge**:

- **Bridge Port** (default: `31415`): The WebSocket port on `localhost` where the MCP server bridge listens. Must match `FOUNDRY_MODULE_BRIDGE_PORT` in your MCP server configuration.
- **Auto Connect** (default: `true`): Automatically connect to the MCP server bridge on game load.

---

## 🔒 Security & Architecture

- The companion bridge communicates **strictly over local WebSocket (`ws://localhost:<port>`)**.
- Only users with GM / Assistant GM permissions can execute bridge commands.
- Commands are scoped to safe, pre-defined handlers (`capture-scene`, `roll-and-post`, `search-compendium-content`, `get-compendium-document`, `get-schema`). No arbitrary `eval` is permitted.
