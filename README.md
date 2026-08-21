# @guan-tends/matrix-mcp-server

[![npm version](https://img.shields.io/npm/v/@guan-tends/matrix-mcp-server.svg)](https://www.npmjs.com/package/@guan-tends/matrix-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

A standalone MCP (Model Context Protocol) tool server that exposes [Matrix](https://matrix.org/) chat operations as callable tools. Any MCP-compatible client — AI agents, automation pipelines, developer tools — can use these tools to send messages, manage rooms, resolve names, and interact with the Matrix protocol.

Built on [`@vector-im/matrix-bot-sdk`](https://github.com/vector-im/matrix-bot-sdk) with full E2EE (end-to-end encryption) support.

## Features

- **15 MCP tools** — messaging, room management, user management, and intelligent ID resolution
- **E2EE support** — full Megolm encryption via Rust crypto backend
- **Human-friendly name resolution** — refer to rooms and users by name, not opaque IDs
- **Alias system** — teach the server custom shortcuts (e.g., `"eng"` → `"!abc123:matrix.org"`)
- **Standalone HTTP server** — runs independently, connect any MCP client via HTTP
- **Zero-cron, zero-LLM** — pure tool server. Scheduling and intelligence live in the agent layer

## Install

```bash
npm install @guan-tends/matrix-mcp-server
```

### Requirements

- Node.js >= 22.0.0
- A Matrix account with an access token

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/guan-tends/matrix-mcp-server.git
cd matrix-mcp-server
npm install
cp config.example.json5 config.json5
```

Edit `config.json5` with your Matrix credentials:

```json5
{
  homeserverUrl: "https://matrix.org",
  accessToken: "syt_...",
  serverName: "matrix.org",
  port: 3456,
  host: "0.0.0.0",
  storePath: "./data/store.json",
  cryptoPath: "./data/crypto",
}
```

### 2. Run

```bash
npm start
```

The server listens on `http://0.0.0.0:3456` and accepts MCP protocol requests over HTTP.

### 3. Connect your MCP client

Point any MCP-compatible client at the server:

```json
{
  "mcpServers": {
    "matrix": {
      "url": "http://localhost:3456"
    }
  }
}
```

Or use with [`@guan-tends/mcp-ai`](https://www.npmjs.com/package/@guan-tends/mcp-ai) aggregator for multi-server tool composition.

## Configuration

### File-based

Edit `config.json5` (see `config.example.json5` for all options).

### Environment variables

All config values can be set via environment variables (highest precedence):

| Variable | Config Key |
|---|---|
| `MATRIX_MCP_HOMESERVER_URL` | `homeserverUrl` |
| `MATRIX_MCP_ACCESS_TOKEN` | `accessToken` |
| `MATRIX_MCP_PORT` | `port` |
| `MATRIX_MCP_HOST` | `host` |
| `MATRIX_MCP_SERVER_NAME` | `serverName` |
| `MATRIX_MCP_STORE_PATH` | `storePath` |
| `MATRIX_MCP_CRYPTO_PATH` | `cryptoPath` |

## Tools (15)

### Messaging

| Tool | Description |
|---|---|
| `send_message` | Send text to a room (by ID or resolved name) |
| `send_html_message` | Send HTML-formatted message |
| `send_reaction` | React to a message with emoji |
| `send_dm` | Send a direct message (creates encrypted DM if needed) |

### Room Management

| Tool | Description |
|---|---|
| `join_room` | Join a room by ID or alias |
| `leave_room` | Leave a room |
| `get_joined_rooms` | List all joined rooms |
| `get_room_messages` | Get recent messages from a room |

### User Management

| Tool | Description |
|---|---|
| `get_presence` | Get presence status for a user |
| `invite_user` | Invite a user to a room |
| `kick_user` | Kick a user from a room |

### ID Resolution

| Tool | Description |
|---|---|
| `set_room_alias` | Teach the server a room alias (e.g., `"eng"` → `"!abc:matrix.org"`) |
| `set_user_alias` | Teach the server a user alias (e.g., `"alice"` → `"@alice:matrix.org"`) |
| `resolve_room` | Resolve a room name to its Matrix ID with confidence score |
| `resolve_user` | Resolve a user name to their Matrix ID with confidence score |

### Resolution Strategy

The resolver uses a hybrid approach with confidence scoring:

1. **User aliases** (confidence: 1.0) — User-defined mappings
2. **Exact match** (confidence: 0.9) — Exact display name or canonical alias
3. **Partial match** (confidence: 0.7) — Partial name match
4. **Ambiguity** (confidence: 0.5) — Multiple matches, returns candidates

## Architecture

```
                    ┌─────────────────────────┐
                    │      index.js            │
                    │   (composition root)     │
                    └──────────┬──────────────┘
                               │ wires
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │ MatrixClient │  │  AliasStore  │  │ McpDataStore │
     │ (bot-sdk)    │  │ (aliases)    │  │ (DM cache)   │
     └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
            │                 │                  │
            └────────┬────────┘                  │
                     ▼                           │
            ┌──────────────────┐                 │
            │ MatrixIdResolver  │◄────────────────┘
            └────────┬─────────┘
                     │
                     ▼
            ┌──────────────────┐
            │   mcp-server.js   │── MCP SDK SimpleServer
            │   (15 tools)      │── HTTP transport
            └──────────────────┘
```

**Composition-Root IoC**: `index.js` wires all dependencies. No module imports another's deps. Each module is independently testable.

### Design Decisions

1. **Composition-Root IoC** — `index.js` wires all dependencies. Modules don't cross-import.
2. **Minimal AliasStore** — Only 4 methods needed for room/user alias management.
3. **Simple JSON persistence** — `persist.js` handles load/save. Two data files.
4. **`withErrorHandling` wrapper** — DRYs the repeated try/catch in every tool.
5. **No cron, no LLM, no bot** — Pure MCP tool server. Agents handle their own scheduling.

## Testing

```bash
# All tests (unit + E2E)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

**65 tests** across 6 files (5 unit, 1 E2E).

## Project Structure

```
src/
├── index.js              — Composition root: config → Matrix client → wire → start
├── mcp-server.js          — 15 MCP tools + helpers (withErrorHandling, resolveRoomInput, etc.)
├── matrix-id-resolver.js  — Room/user name → Matrix ID resolution
├── alias-store.js         — Minimal per-user alias storage
├── mcp-data-store.js      — DM room ID cache
└── persist.js             — Simple JSON load/save utility

__tests__/
├── unit/                  — Unit tests (alias-store, mcp-data-store, resolver, mcp-server, persist)
├── e2e/                   — E2E test (full server start → MCP client → tool calls)
├── mocks/                 — Mock MatrixClient for testing
└── vitest.config.js
```

## Sponsors

If this project is useful to you, consider supporting its development:

- **[GitHub Sponsors](https://github.com/guan-tends/matrix-mcp-server#sponsors)**
- **Solana**: `Eu8wQcW68TKMs1a6eqzZu8znzU52QLqQugAMG8uCD6y6`
- **EVM** (Ethereum / Base / Arbitrum / Optimism / Polygon): `0x2733ff7c865C56d565a99BE1DC11B81cc76850A5`
- **XRP Ledger**: `r4X6e7McAQj7e8vBCeued1RYu4mCJrREDG`

## License

[MIT](LICENSE) © 2026 [Guan](https://github.com/guan-tends)
