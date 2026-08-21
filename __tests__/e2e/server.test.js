/**
 * E2E Test — Starts the Matrix MCP server on a test port and connects
 * via MCP StreamableHTTPClientTransport to verify the full round-trip:
 * initialize → listTools → callTool.
 *
 * Uses the mock MatrixClient so no live Matrix server is needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMatrixMcpServer } from '../../src/mcp-server.js'
import { AliasStore } from '../../src/alias-store.js'
import { McpDataStore } from '../../src/mcp-data-store.js'
import { MatrixIdResolver } from '../../src/matrix-id-resolver.js'
import { createMockMatrixClient } from '../mocks/matrix-client.mock.js'

const TEST_PORT = 3459
const TEST_URL = `http://127.0.0.1:${TEST_PORT}/`

describe('E2E: Matrix MCP Server', () => {
  let server, client

  beforeAll(async () => {
    const matrixClient = createMockMatrixClient()
    const aliasStore = new AliasStore()
    const mcpDataStore = new McpDataStore()
    const resolver = new MatrixIdResolver({ log: () => {}, matrixClient, aliasStore })

    server = createMatrixMcpServer(matrixClient, {
      aliasStore,
      mcpDataStore,
      resolver,
      homeserverUrl: 'https://matrix.org',
      serverName: 'matrix.org',
      port: TEST_PORT,
      host: '127.0.0.1',
    })

    await server.start()

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Connect MCP client
    client = new Client({ name: 'test-client', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(TEST_URL))
    await client.connect(transport)
  })

  afterAll(async () => {
    if (client) await client.close()
    if (server) await server.stop()
  })

  it('lists all 15 tools', async () => {
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(15)

    const toolNames = tools.map((t) => t.name).sort()
    expect(toolNames).toContain('send_message')
    expect(toolNames).toContain('send_html_message')
    expect(toolNames).toContain('send_reaction')
    expect(toolNames).toContain('send_dm')
    expect(toolNames).toContain('join_room')
    expect(toolNames).toContain('leave_room')
    expect(toolNames).toContain('get_joined_rooms')
    expect(toolNames).toContain('get_room_messages')
    expect(toolNames).toContain('get_presence')
    expect(toolNames).toContain('invite_user')
    expect(toolNames).toContain('kick_user')
    expect(toolNames).toContain('set_room_alias')
    expect(toolNames).toContain('set_user_alias')
    expect(toolNames).toContain('resolve_room')
    expect(toolNames).toContain('resolve_user')
  })

  it('executes send_message tool via MCP', async () => {
    const result = await client.callTool({
      name: 'send_message',
      arguments: { roomId: '!room1:matrix.org', message: 'Hello from E2E test' },
    })

    expect(result.isError).toBeFalsy()
    const text = result.content[0].text
    const parsed = JSON.parse(text)
    expect(parsed.success).toBe(true)
    expect(parsed.roomId).toBe('!room1:matrix.org')
  })

  it('executes get_joined_rooms tool via MCP', async () => {
    const result = await client.callTool({
      name: 'get_joined_rooms',
      arguments: {},
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.success).toBe(true)
    expect(parsed.rooms).toEqual(['!room1:matrix.org', '!room2:matrix.org'])
  })

  it('executes resolve_room tool via MCP', async () => {
    const result = await client.callTool({
      name: 'resolve_room',
      arguments: { roomName: 'Engineering' },
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.success).toBe(true)
    expect(parsed.roomId).toBe('!room1:matrix.org')
    expect(parsed.confidence).toBe(0.9)
  })

  it('returns error for unknown tool', async () => {
    // MCP server returns an error result for unknown tools
    const result = await client.callTool({
      name: 'nonexistent_tool',
      arguments: {},
    })
    // The server returns isError: true for unknown tools
    expect(result.isError).toBe(true)
  })
})
