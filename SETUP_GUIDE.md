# FoundryVTT MCP Server Setup Guide

This guide walks you through setting up and configuring the FoundryVTT Model Context Protocol (MCP) Server for use with your AI assistant.

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js 18+** or **Bun** installed.
- **FoundryVTT v11+ / v12+** running with an **active world** (not on the world selection/setup screen).
- An MCP client (Claude Desktop, Claude Code, Oh My Pi, VS Code, Cursor).

### 2. Set Up a Dedicated Foundry User
In FoundryVTT:
1. Open **Configuration** (gear icon) → **User Management**.
2. Click **Create User**.
3. Set **User Name** (e.g. `mcp-api`) and a password (e.g. `mcp`).
4. Set Role to **Gamemaster** or **Assistant GM** (ensure write permissions are granted).
5. Save changes.

### 3. Install Companion Module (FoundryVTT MCP Bridge)
Copy the `foundry-module` folder from this repository into your FoundryVTT `Data/modules/` directory:

```bash
# Windows
cp -r foundry-module "%LOCALAPPDATA%/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

# macOS
cp -r foundry-module "~/Library/Application Support/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"

# Linux
cp -r foundry-module "~/.local/share/FoundryVTT/Data/modules/foundryvtt-mcp-bridge"
```

In FoundryVTT, go to **Manage Modules** and check **FoundryVTT MCP Bridge**.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in the server root and configure:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `FOUNDRY_URL` | **Yes** | `http://localhost:30000` | FoundryVTT server URL |
| `FOUNDRY_USERNAME` | **Yes** | — | Dedicated user account name |
| `FOUNDRY_PASSWORD` | **Yes** | — | Dedicated user password |
| `FOUNDRY_WRITE_ENABLED` | No | `true` | Enables game-state mutations (walls, lights, tokens, items) |
| `FOUNDRY_MODULE_BRIDGE_ENABLED` | No | `true` | Enables WebSocket bridge for canvas screenshots & chat rolls |
| `FOUNDRY_MODULE_BRIDGE_PORT` | No | `31415` | WebSocket port for the companion bridge |
| `FOUNDRY_DATA_PATH` | No | — | Local filesystem path to Foundry `Data/` directory |
| `FOUNDRY_API_KEY` | No | — | Optional REST API module key for server diagnostics |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

---

## 🔌 MCP Client Configurations

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "foundryvtt": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/dist/index.js"],
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

### Oh My Pi (`~/.omp/agent/mcp.json`)

```json
{
  "mcpServers": {
    "foundryvtt": {
      "type": "stdio",
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/dist/index.js"],
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

## 🧪 Verifying the Installation

1. **Build and test locally:**
   ```bash
   npm install
   npm run build
   npm test
   ```
2. **Start the server:**
   ```bash
   npm start
   ```
3. Check the startup logs:
   - `Connected to FoundryVTT via Socket.IO`
   - `Module bridge listening on ws://localhost:31415`
   - `Foundry module connected to bridge` (when Foundry is open in a browser)

---

## 🛠️ Troubleshooting

- **Socket.IO Authentication Failed**: Double-check that the Foundry world is active, the username is exact (case-sensitive), and the password matches.
- **Companion Bridge Not Connecting**: Ensure the module is enabled in Foundry's module manager, and that `FOUNDRY_MODULE_BRIDGE_PORT` matches the port configured in the module's settings (default: 31415).
- **Write Operations Rejected**: Verify `FOUNDRY_WRITE_ENABLED=true` is set and the Foundry user has Gamemaster or Assistant GM role.
