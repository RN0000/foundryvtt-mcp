# FoundryVTT MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-645%20passing-brightgreen.svg)](https://vitest.dev/)
[![Tools](https://img.shields.io/badge/MCP%20Tools-94-purple.svg)](https://modelcontextprotocol.io/)

A comprehensive, production-grade [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for **Foundry Virtual Tabletop (FoundryVTT)**.

This server empowers AI assistants (Claude Desktop, Claude Code, Oh My Pi, VS Code, Cursor, etc.) to act as fully capable, autonomous **Co-GMs and GM assistants** inside FoundryVTT. It provides complete read and write access across game mechanics, actors, items, tokens, combat encounters, canvas placeables (walls, lights, sounds, templates, drawings, notes, tiles), playlists, macros, roll tables, compendiums, world settings, and live canvas rendering.

---

## 🌟 Key Highlights & Capabilities (94 Tools)

- 🎲 **Game Mechanics & Interactive Chat**: Roll dice with standard or complex drop/keep notation (`4d6kh3`, `1d20r1`). Roll and post interactive, clickable chat cards directly to the Foundry chat log via the companion bridge.
- 🗺️ **Full Canvas & Spatial Control**: Create, inspect, update, and remove all canvas placeable types:
  - **Walls**: standard, doors (open/close/lock), secret doors, windows, ethereal walls, and custom endpoints.
  - **Ambient Lights**: coordinate or grid-cell placement, dim/bright radii, animation effects, color thresholds.
  - **Ambient Sounds**: audio tracks, radii, volume, repeat modes.
  - **Measured Templates**: cone, circle, ray, and rect spell area-of-effect markers with directional rotation and colors.
  - **Drawings**: freehand and geometrical shapes (`circle`, `rect`, `ellipse`, `polygon`), stroke/fill styling, and text annotations.
  - **Map Notes & Pins**: landmark markers linked to journal entries or standalone labels.
  - **Tiles & Backgrounds**: place decorative tiles and props with automatic dimension discovery from image assets.
- 🧙 **Token & Actor Control**:
  - **A\* Pathfinding Movement**: tokens navigate around walls and automatically open closed doors along their path.
  - **Token Vision & Lighting**: configure sight ranges, vision modes, dim/bright emitted light, and vision detection angles.
  - **Status Conditions**: apply/remove system-agnostic status conditions (`prone`, `stunned`, `blinded`, etc.).
  - **Compendium-Sourced Item Import**: import weapons, spells, cyberware, and equipment directly from compendium packs into an actor's inventory in a single call.
  - **System Attribute Mutations**: patch actor system data (HP, temporary HP, currency, resources, spell slots) using JSON merge patches.
- ⚔️ **Combat Encounter Management**: Create encounters, seed combatants from tokens, manage initiative orders, advance turns/rounds, track active combatants, and end encounters.
- 📜 **World Documents & Organization**:
  - **Folders**: manage hierarchical folder structures for actors, items, journals, and scenes.
  - **Macros**: inspect, create, and delete script/chat macros.
  - **Playlists & Audio**: create multi-track playlists, control playback (play, pause, stop), and adjust track states.
  - **Roll Tables**: create tables with automatic sequential range distribution (`1dN`), and draw live results.
  - **World Settings**: safely inspect and update module and system settings with built-in protection against core engine corruption.
- 🌫️ **Scene & Exploration Management**: Switch active scenes, adjust darkness levels, toggle global illumination, and reset Fog of War exploration.
- 📸 **Canvas Viewport Capture**: Screenshot the GM canvas viewport with a burned-in coordinate grid overlay (`[col,row]`) for spatial AI reasoning.
- 🔍 **Rules & Compendium Search**: Search world documents, compendium packs, and rule text with contextual snippets.

---

## 🏗️ Architecture

The server employs a hybrid architecture to deliver real-time responsiveness and deep game-engine integration:

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Assistant / MCP Client                │
│             (Claude Desktop, Oh My Pi, VS Code)             │
└──────────────────────────────┬──────────────────────────────┘
                               │ MCP (stdio)
┌──────────────────────────────▼──────────────────────────────┐
│                    FoundryVTT MCP Server                    │
├──────────────────────────────┬──────────────────────────────┤
│  In-Memory World Cache       │  A* Pathfinding Router       │
│  (Live Socket.IO Sync)       │  Dice Notation Engine        │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ Socket.IO (Port 30000)       │ WebSocket (Port 31415)
               │ (modifyDocument / Events)    │ (Bridge Protocol)
┌──────────────▼──────────────────────────────▼───────────────┐
│                    FoundryVTT Game Engine                   │
│  ┌────────────────────────┐    ┌─────────────────────────┐  │
│  │   Active World & Data  │    │  Companion Module       │  │
│  │   (Actors, Scenes, …)  │    │  (foundryvtt-mcp-bridge)│  │
│  └────────────────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

1. **Socket.IO Primary Connection**: Connects to FoundryVTT as an authenticated user (`mcp-api`). Automatically synchronizes and caches the world state, enabling instant lookups and high-frequency document mutations via the `modifyDocument` protocol.
2. **Companion Module Bridge (`foundryvtt-mcp-bridge`)**: A lightweight Foundry module running in the browser that executes canvas-bound operations (PIXI canvas screenshot with grid overlay, native `Roll` chat card rendering, document schema introspection, and compendium item extraction).
3. **Optional REST API Module**: Provides server diagnostics, log retrieval, and health reporting when the local REST module is installed.

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js 18+** or **Bun**
- **FoundryVTT v11+ / v12+** running an active world
- A dedicated Foundry user account with **Gamemaster** or **Assistant GM** role

### 2. Configure Dedicated Foundry User

In FoundryVTT:
1. Open **Configuration** → **User Management**
2. Click **Create User**
3. Set Username: `mcp-api`, Password: `mcp` (or your choice)
4. Role: **Gamemaster** (or **Assistant GM** with write permissions enabled)

### 3. Install the Companion Module (Recommended)

Copy the `foundry-module` folder from this repo to your FoundryVTT `Data/modules/` directory:

```bash
# Windows
cp -r foundry-module "%LOCALAPPDATA%/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

# macOS
cp -r foundry-module "~/Library/Application Support/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

# Linux
cp -r foundry-module "~/.local/share/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"
```

In FoundryVTT, go to **Manage Modules** and enable **FoundryVTT MCP Bridge**.

---

## ⚙️ Configuration & Client Setup

### Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `FOUNDRY_URL` | **Yes** | `http://localhost:30000` | FoundryVTT server URL |
| `FOUNDRY_USERNAME` | **Yes** | — | FoundryVTT user account name |
| `FOUNDRY_PASSWORD` | **Yes** | — | FoundryVTT user account password |
| `FOUNDRY_WRITE_ENABLED` | No | `true` | Enables game-state mutations (walls, actors, tokens, etc.) |
| `FOUNDRY_MODULE_BRIDGE_ENABLED` | No | `true` | Enables WebSocket bridge for canvas screenshots & chat rolls |
| `FOUNDRY_MODULE_BRIDGE_PORT` | No | `31415` | WebSocket port for the companion module bridge |
| `FOUNDRY_DATA_PATH` | No | — | Local path to Foundry `Data/` for asset dimension discovery |
| `FOUNDRY_API_KEY` | No | — | Optional REST API key for server diagnostics tools |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "foundryvtt": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/dist/index.js"],
      "env": {
        "FOUNDRY_URL": "http://localhost:30000",
        "FOUNDRY_USERNAME": "mcp-api",
        "FOUNDRY_PASSWORD": "mcp",
        "FOUNDRY_WRITE_ENABLED": "true",
        "FOUNDRY_MODULE_BRIDGE_ENABLED": "true",
        "FOUNDRY_MODULE_BRIDGE_PORT": "31415"
      }
    }
  }
}
```

### Oh My Pi Configuration

Add to `~/.omp/agent/mcp.json` (or `~/.omp/mcp.json`):

```json
{
  "mcpServers": {
    "foundryvtt": {
      "type": "stdio",
      "command": "node",
      "args": ["<PATH_TO_REPO>/dist/index.js"],
      "env": {
        "FOUNDRY_URL": "http://localhost:30000",
        "FOUNDRY_USERNAME": "mcp-api",
        "FOUNDRY_PASSWORD": "mcp",
        "FOUNDRY_WRITE_ENABLED": "true",
        "FOUNDRY_MODULE_BRIDGE_ENABLED": "true",
        "FOUNDRY_MODULE_BRIDGE_PORT": "31415"
      },
      "timeout": 60000
    }
  }
}
```

---

## 🛠️ Tool Catalog (94 Tools)

### 1. Canvas & Spatial Placeables
- `create_wall` / `delete_wall` / `list_walls` / `set_door_state` — complete wall and door geometry management.
- `create_light` / `update_light` / `delete_light` / `list_lights` — ambient lighting control (radii, colors, animations).
- `create_sound` / `delete_sound` / `list_sounds` — ambient audio placement on canvas scenes.
- `create_template` / `delete_template` / `list_templates` — spell and effect area-of-effect templates.
- `create_drawing` / `delete_drawing` / `list_drawings` — map shapes, zones, and text annotations.
- `create_note` / `delete_note` / `list_notes` — map pins and landmark markers.
- `create_tile` / `delete_tile` / `list_tiles` — decorative tiles and map props.
- `capture_scene` — screenshot the active scene canvas with a grid coordinate overlay burned in.
- `find_open_cells` — scan scenes for unblocked grid cells suitable for token/prop placement.
- `list_scene_assets` — discover map backgrounds, token art, and audio files with parsed tags and dimensions.

### 2. Tokens & Movement
- `spawn_token` — place actor tokens on scenes with custom size, elevation, and coordinates.
- `delete_token` — remove tokens from scenes without deleting the underlying actor.
- `list_tokens` — list placed tokens on active or specific scenes.
- `move_token` — teleport a token to exact pixel coordinates.
- `move_token_pathfind` — move tokens using A* obstacle avoidance around walls with automatic door opening.
- `move_tokens` — batch move multiple tokens simultaneously.
- `update_token_vision` — configure vision ranges, vision modes, dim/bright emitted lights, and angles.
- `apply_status_effect` — toggle conditions (`prone`, `stunned`, `blinded`, `invisible`, etc.).

### 3. Actors & Inventory
- `create_world_actor` / `create_full_actor` / `delete_world_actor` — create and delete actor documents.
- `search_actors` — query actors by name and type with cursor pagination support.
- `get_actor_details` — retrieve actor system data, statistics, attributes, and health.
- `update_actor_attributes` — patch nested system data using dot paths (`attributes.hp.value`, `currency.gp`).
- `get_actor_inventory` — list owned items with full system properties.
- `create_actor_item` — create inline items OR import directly from compendium packs (`source: { type: 'compendium', compendiumId, itemId }`).
- `update_actor_item` — apply JSON merge patches to owned items.
- `delete_actor_item` — delete specific items from actor inventories.

### 4. Combat Encounters
- `start_combat` — create encounters and seed combatants from scene tokens.
- `get_combat_state` — retrieve combatant turn order, HP, AC, and round number.
- `set_initiative` — set combatant initiative values and re-order turns.
- `next_turn` — advance the turn tracker (handles round increments and skips defeated combatants).
- `end_combat` — terminate active encounters.

### 5. World Documents & Organization
- `list_folders` / `create_folder` — organize actors, items, journals, and scenes in nested folders.
- `list_macros` / `create_macro` / `delete_macro` — manage script and chat macro documents.
- `list_playlists` / `create_playlist` / `set_playlist_state` / `delete_playlist` — audio playlist and sound controls.
- `create_roll_table` / `delete_roll_table` / `roll_table` / `list_roll_tables` — table creation and result rolling.
- `get_world_setting` / `set_world_setting` — inspect and modify system/module settings with core protection.
- `create_journal_entry` / `get_journal` / `search_journals` / `delete_journal_entry` — manage session notes and lore.

### 6. Scene & Exploration
- `create_scene` / `delete_scene` / `get_scene_info` / `switch_scene` — scene creation and player activation.
- `set_scene_lighting` — ambient darkness levels and global illumination settings.
- `reset_fog` — reset Fog of War exploration on active scenes.

### 7. Game Mechanics & Bridge Tools
- `roll_dice` — local mathematical dice formula evaluation.
- `roll_and_post` — evaluates formulas via Foundry's native engine and posts interactive chat cards.
- `lookup_rule` — search world journals and system compendium packs for rules with snippet previews.
- `get_document_schema` — introspect game system DataModel schemas for actor and item types.
- `search_compendium_content` — deep search inside compendium pack documents and journal pages.
- `generate_npc` / `generate_loot` — instant procedural generators.

### 8. Diagnostics & Logging
- `get_health_status` / `get_system_health` — connection and server health metrics.
- `get_recent_logs` / `search_logs` — inspect server logs and error stack traces.
- `diagnose_errors` — analyze recent errors into prioritized resolution suggestions.

---

## 🧪 Development & Testing

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run complete unit test suite (645 tests)
npm test

# Run linter and formatting checks
npm run lint

# Start server in development watch mode
npm run dev
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
