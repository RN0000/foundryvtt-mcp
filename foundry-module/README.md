# FoundryVTT MCP Bridge (Companion Module)

This is the companion FoundryVTT module for the [FoundryVTT MCP Server](https://github.com/RN0000/foundryvtt-mcp).

While the MCP server handles game-state reads and document mutations over Socket.IO, some features require access to the live browser runtime, PIXI canvas, or Foundry's internal JavaScript APIs:

- 📸 **Live Canvas Viewport Screenshots (`capture-scene`)**: `canvas.app.renderer.extract` captures the GM view with burned-in grid coordinates (`[col, row]`) for spatial AI reasoning.
- 🎲 **Interactive Chat Roll Cards (`roll-and-post`)**: evaluates `new Roll(formula).evaluate()` and posts authentic, clickable 3D-dice roll cards.
- 🎯 **Token Targeting & Canvas Pings (`set-target`, `get-targets`, `ping-canvas`)**: sets token targeting reticles, inspects connected users' target selections, and broadcasts animated camera pings to all players on the active scene.
- ⏸️ **Game Clock Controls (`set-pause`)**: pauses or resumes the game clock directly in the GM browser session.
- 📤 **Native FilePicker Asset Uploads (`upload-asset`)**: uploads images, maps, and audio directly via Foundry's internal `FilePicker.upload()` API.
- 📦 **Compendium Deep Search & Document Extraction (`search-compendium-content`, `get-compendium-document`)**: searches pack indices with regex text matching and extracts raw compendium documents for world imports.
- 📑 **DataModel Schema Introspection (`get-schema`)**: dynamically introspects `CONFIG.Actor.dataModels` and `CONFIG.Item.dataModels` for exact system field schemas and choices.

This module only activates its bridge connection for a **GM or Assistant-GM** user (`game.user.isGM`) — Foundry itself restricts canvas fog-of-war, `game.togglePause()`, and `FilePicker.upload()` to that permission tier. **You do not need to manually keep a GM browser tab open for this**: the MCP server automatically drives its own invisible background browser session logged in as your GM/Assistant-GM account, so a human can play as a normal Player in their own visible Foundry client while this module stays connected through that background session. See the server's `FOUNDRY_HEADLESS_GM_ENABLED` setting to opt out and manage a GM tab manually instead.

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

---

## 🔒 Security & Architecture

- The companion bridge communicates **strictly over local WebSocket (`ws://localhost:<port>`)**.
- Only users with GM / Assistant GM permissions can execute bridge commands.
- Commands are scoped to safe, pre-defined handlers (`capture-scene`, `roll-and-post`, `search-compendium-content`, `get-compendium-document`, `get-schema`, `set-target`, `get-targets`, `ping-canvas`, `set-pause`, `upload-asset`). No arbitrary `eval` is permitted.
