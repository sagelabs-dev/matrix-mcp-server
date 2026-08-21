# @guan/matrix-mcp-server

Standalone Matrix MCP tool server exposing Matrix chat operations via the Model Context Protocol.

Designed to be wrapped by `@guan/mcp-ai`'s aggregator — any agent (Mneme, Mnemos, or any MCP client) connects through the aggregator to call Matrix operations as tools.

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
            │   mcp-server.js   │── @guan/mcp-ai SimpleServer
            │   (15 tools)      │── HTTP transport, port 3456
            └──────────────────┘
```

**Composition-Root IoC**: `index.js` wires all dependencies. No module imports another's deps. Each module is independently testable. The server factory (`createMatrixMcpServer`) accepts already-constructed dependencies.

## Setup

### Prerequisites

- Node.js >= 22.0.0
- A Matrix account with an access token

### Installation

```bash
git clone http://192.168.8.142:8561/guan/matrix-mcp-server.git
cd matrix-mcp-server
npm install
```

### Configuration

Copy the example config and fill in your Matrix credentials:

```bash
cp config.example.json5 config.json5
```

```json5
{
  homeserverUrl: "https://matrix.org",
  accessToken: "syt_...",
  serverName: "matrix.org",
  port: 3456,
  host: "0.0.0.0",
  storePath: "./data/store",
  cryptoPath: "./data/crypto",
}
```

Environment variable overrides (highest precedence):

| Variable | Config Key |
|---|---|
| `MATRIX_MCP_HOMESERVER_URL` | `homeserverUrl` |
| `MATRIX_MCP_ACCESS_TOKEN` | `accessToken` |
| `MATRIX_MCP_PORT` | `port` |
| `MATRIX_MCP_HOST` | `host` |
| `MATRIX_MCP_SERVER_NAME` | `serverName` |
| `MATRIX_MCP_STORE_PATH` | `storePath` |
| `MATRIX_MCP_CRYPTO_PATH` | `cryptoPath` |

### Running

```bash
npm start
```

## Aggregator Integration

In your `@guan/mcp-ai` aggregator config:

```json5
{
  "mcps": [
    {
      "id": "matrix",
      "connection": {
        "type": "http",
        "url": "http://localhost:3456"
      }
    }
    // ... other MCP servers
  ]
}
```

The aggregator connects to the Matrix MCP server, discovers its 15 tools, and exposes them (with optional prefixing: `matrix_send_message`, `matrix_join_room`, etc.) to any agent.

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
| `set_room_alias` | Teach the server a room alias (e.g., "eng" → "!abc:matrix.org") |
| `set_user_alias` | Teach the server a user alias (e.g., "alice" → "@alice:matrix.org") |
| `resolve_room` | Resolve a room name to its Matrix ID with confidence score |
| `resolve_user` | Resolve a user name to their Matrix ID with confidence score |

### ID Resolution Strategy

The resolver uses a hybrid approach with confidence scoring:

1. **User aliases** (confidence: 1.0) — User-defined mappings
2. **Exact match** (confidence: 0.9) — Exact display name or canonical alias
3. **Partial match** (confidence: 0.7) — Partial name match
4. **Ambiguity** (confidence: 0.5) — Multiple matches, returns candidates

## Testing

```bash
# All tests (unit + E2E)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Current test suite: **65 tests across 6 files** (5 unit, 1 E2E).

## Project Structure

```
src/
├── index.js              — Composition root: config → Matrix client → wire → start
├── mcp-server.js          — 15 MCP tools + helpers (withErrorHandling, resolveRoomInput, etc.)
├── matrix-id-resolver.js  — Room/user name → Matrix ID resolution
├── alias-store.js         — Minimal per-user alias storage (replaces 695-line Sessions)
├── mcp-data-store.js      — DM room ID cache
└── persist.js             — Simple JSON load/save utility

__tests__/
├── unit/                  — Unit tests (alias-store, mcp-data-store, resolver, mcp-server, persist)
├── e2e/                   — E2E test (full server start → MCP client → tool calls)
├── mocks/                 — Mock MatrixClient for testing
└── vitest.config.js
```

## Design Decisions

1. **Composition-Root IoC** — `index.js` wires all dependencies. Modules don't cross-import.
2. **Minimal AliasStore** — Replaces the 695-line `Sessions` class. Only 4 methods needed.
3. **Simple JSON persistence** — `persist.js` (20 lines) over `DataManager` (189 lines). Two files.
4. **`withErrorHandling` wrapper** — DRYs the repeated try/catch in every tool.
5. **No cron, no LLM, no bot** — Pure MCP tool server. Agents handle their own scheduling.
6. **`fullUserId` bug fix** — Latent bug in original `resolveRoomInput` (undefined variable reference).
7. **Same SimpleServer interface** — `@guan/mcp-ai/simple-server`, HTTP transport, same as original.

## Extraction Origin

Extracted from `guan-matrix-chat` (April–August 2026). The original `mcp-server.js` (935 lines, 19 tools) was trimmed to 534 lines, 15 tools (cron removed), with the `withErrorHandling` DRY wrapper added and the `fullUserId` latent bug fixed.

## License

UNLICENSED — Private, internal use.
