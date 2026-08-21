/**
 * Matrix MCP Server — Composition Root (Entry Point)
 *
 * Wires all dependencies, loads configuration, starts the MCP server,
 * and handles graceful shutdown with state persistence.
 *
 * Architecture: Composition-Root IoC pattern. This is the only file that
 * knows about all components. Each module is independently testable.
 *
 * Config hierarchy (lowest → highest precedence):
 *   1. Code defaults
 *   2. JSON5 config file (default: ./config.json5)
 *   3. Environment variables (MATRIX_MCP_* prefix)
 *
 * @module index
 */

import {
  MatrixClient,
  RustSdkCryptoStorageProvider,
  SimpleFsStorageProvider,
} from '@vector-im/matrix-bot-sdk'
import JSON5 from 'json5'
import { readFile } from 'fs/promises'

import { createMatrixMcpServer } from './mcp-server.js'
import { MatrixIdResolver } from './matrix-id-resolver.js'
import { AliasStore } from './alias-store.js'
import { McpDataStore } from './mcp-data-store.js'
import { loadJson, saveJson } from './persist.js'

// ──────────────────────────────────────────────────────────────────────────
// Config Loading
// ──────────────────────────────────────────────────────────────────────────

/** @type {Record<string, *>} */
const DEFAULTS = {
  port: 3456,
  host: '0.0.0.0',
  storePath: './data/store',
  cryptoPath: './data/crypto',
  aliasPath: './data/aliases.json',
  dmCachePath: './data/dm-cache.json',
  serverName: null,
  superIds: [],
}

/**
 * Load configuration from file, then apply environment variable overrides.
 *
 * @returns {Promise<Object>} Merged configuration object.
 */
async function loadConfig() {
  // Layer 1: Defaults
  let config = { ...DEFAULTS }

  // Layer 2: JSON5 config file
  const configPath = process.env.MATRIX_MCP_CONFIG || './config.json5'
  try {
    const raw = await readFile(configPath, 'utf-8')
    const fileConfig = JSON5.parse(raw)
    config = { ...config, ...fileConfig }
  } catch {
    // Config file is optional — env vars can provide everything
    if (process.env.MATRIX_MCP_DEBUG) {
      console.info('[MatrixMCP] No config file found at', configPath, '— using defaults + env')
    }
  }

  // Layer 3: Environment variable overrides (MATRIX_MCP_*)
  const envMap = {
    MATRIX_MCP_HOMESERVER_URL: 'homeserverUrl',
    MATRIX_MCP_ACCESS_TOKEN: 'accessToken',
    MATRIX_MCP_STORE_PATH: 'storePath',
    MATRIX_MCP_CRYPTO_PATH: 'cryptoPath',
    MATRIX_MCP_PORT: 'port',
    MATRIX_MCP_HOST: 'host',
    MATRIX_MCP_SERVER_NAME: 'serverName',
  }

  for (const [envKey, configKey] of Object.entries(envMap)) {
    if (process.env[envKey] !== undefined) {
      const value =
        envKey === 'MATRIX_MCP_PORT' ? parseInt(process.env[envKey], 10) : process.env[envKey]
      config[configKey] = value
    }
  }

  return config
}

// ──────────────────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────────────────

/**
 * Initialize and start the Matrix MCP server.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const config = await loadConfig()

  // Validate required config
  if (!config.homeserverUrl) {
    console.error(
      '[MatrixMCP] FATAL: homeserverUrl is required (config file or MATRIX_MCP_HOMESERVER_URL)'
    )
    process.exit(1)
  }
  if (!config.accessToken) {
    console.error(
      '[MatrixMCP] FATAL: accessToken is required (config file or MATRIX_MCP_ACCESS_TOKEN)'
    )
    process.exit(1)
  }

  // ── Initialize Matrix Client with E2EE ──
  const storage = new SimpleFsStorageProvider(config.storePath)
  const cryptoProvider = new RustSdkCryptoStorageProvider(config.cryptoPath)
  const matrixClient = new MatrixClient(
    config.homeserverUrl,
    config.accessToken,
    storage,
    cryptoProvider
  )
  console.info('[MatrixMCP] Matrix client initialized')

  // ── Start Matrix sync (required for E2EE crypto initialization) ──
  await matrixClient.start()
  console.info('[MatrixMCP] Matrix sync started (E2EE crypto initialized)')

  // ── Load persisted state ──
  const aliasData = await loadJson(config.aliasPath)
  const dmCacheData = await loadJson(config.dmCachePath)

  // ── Create stores ──
  const aliasStore = new AliasStore(aliasData || {})
  const mcpDataStore = new McpDataStore(dmCacheData || {})

  // ── Create ID resolver ──
  const resolver = new MatrixIdResolver({
    log: () => {},
    matrixClient,
    aliasStore,
  })

  // ── Create and start MCP server ──
  const server = createMatrixMcpServer(matrixClient, {
    aliasStore,
    mcpDataStore,
    resolver,
    homeserverUrl: config.homeserverUrl,
    serverName: config.serverName,
    port: config.port,
    host: config.host,
    superIds: config.superIds,
  })

  await server.start()
  console.info(`[MatrixMCP] Server listening on ${config.host}:${config.port}`)

  // ── Graceful shutdown ──
  /**
   * Persist state and shut down cleanly.
   */
  async function shutdown() {
    console.info('[MatrixMCP] Shutting down...')

    // Persist stores
    await saveJson(config.aliasPath, JSON.parse(aliasStore.toJSON()))
    await saveJson(config.dmCachePath, JSON.parse(mcpDataStore.toJSON()))
    console.info('[MatrixMCP] State persisted')

    // Stop server
    await server.stop()
    console.info('[MatrixMCP] Server stopped')

    // Stop Matrix sync
    await matrixClient.stop()
    console.info('[MatrixMCP] Matrix sync stopped')

    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('[MatrixMCP] Fatal error:', error)
  process.exit(1)
})
