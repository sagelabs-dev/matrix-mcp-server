/**
 * Matrix MCP Server — Exposes Matrix chat operations as MCP tools.
 *
 * Creates a SimpleServer from @guan-tends/mcp-ai that wraps Matrix SDK operations
 * into MCP tool calls. Designed for standalone operation: the server receives
 * a pre-initialized MatrixClient and supporting stores via dependency injection.
 *
 * Tools (15 total):
 *   Messaging: send_message, send_html_message, send_reaction, send_dm
 *   Room ops:  join_room, leave_room, get_joined_rooms, get_room_messages
 *   User ops:  get_presence, invite_user, kick_user
 *   ID resolution: set_room_alias, set_user_alias, resolve_room, resolve_user
 *
 * @module mcp-server
 */

import { createSimpleServer } from '@guan-tends/mcp-ai/simple-server/index.js'
import { z } from 'zod'

// ──────────────────────────────────────────────────────────────────────────
// Error Handling Wrapper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wrap an async tool handler with standardized error handling.
 *
 * Every tool follows the same pattern: try → return success JSON,
 * catch → return error JSON with isError flag. This wrapper DRYs that
 * pattern so each tool's execute function only contains its business logic.
 *
 * @param {Function} fn - Async function returning an MCP result object.
 * @returns {Function} Wrapped async function with error handling.
 */
async function withErrorHandling(fn) {
  try {
    return await fn()
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }],
      isError: true,
    }
  }
}

/**
 * Create a success MCP result.
 * @param {Object} data - Data to include in the result.
 * @returns {Object} MCP CallToolResult.
 */
function success(data) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }) }] }
}

// ──────────────────────────────────────────────────────────────────────────
// Shared Zod Schemas
// ──────────────────────────────────────────────────────────────────────────

const schemas = {
  roomId: z.string().describe('Matrix room ID (e.g., !abc123:server.com)'),
  roomIdOrAlias: z
    .string()
    .describe('Matrix room ID or alias (e.g., !abc123:server.com or #room:server.com)'),
  roomName: z
    .string()
    .optional()
    .describe('Human-friendly room name. Resolved to room ID if roomId is not provided.'),
  userId: z.string().describe('Matrix user ID (e.g., @user:server.com)'),
  userName: z
    .string()
    .optional()
    .describe(
      'Human-friendly user name or display name. Resolved to user ID if userId is not provided.'
    ),
  message: z.string().describe('Message text content'),
  emoji: z.string().describe('Emoji reaction (e.g., 👍, ❤️)'),
  alias: z.string().describe('User-defined alias for a room or user'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of results'),
}

// ──────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve room input — accepts either a direct roomId or a human-friendly roomName.
 *
 * @param {string|null} roomId - Direct room ID.
 * @param {string|null} roomName - Human-friendly name to resolve.
 * @param {string} requestingUserId - The user making the request (for alias lookup).
 * @param {Object} resolver - MatrixIdResolver instance.
 * @returns {Promise<{ roomId: string, confidence: number, source: string }>}
 * @throws {Error} If neither roomId nor roomName is provided, or resolution fails.
 */
async function resolveRoomInput(roomId, roomName, requestingUserId, resolver) {
  if (roomId) return { roomId, confidence: 1.0, source: 'direct' }
  if (roomName && resolver) {
    const result = await resolver.resolveRoom(roomName, requestingUserId)
    if (result.roomId) return result
    throw new Error(
      `Could not resolve room "${roomName}": ${result.ambiguity ? 'ambiguous matches' : 'not found'}`
    )
  }
  throw new Error('Either roomId or roomName must be provided')
}

/**
 * Resolve user input — accepts either a direct userId or a human-friendly userName.
 *
 * @param {string|null} userId - Direct user ID.
 * @param {string|null} userName - Human-friendly name to resolve.
 * @param {string} requestingUserId - The user making the request (for alias lookup).
 * @param {Object} resolver - MatrixIdResolver instance.
 * @returns {Promise<{ userId: string, confidence: number, source: string }>}
 * @throws {Error} If neither userId nor userName is provided, or resolution fails.
 */
async function resolveUserInput(userId, userName, requestingUserId, resolver) {
  if (userId) return { userId, confidence: 1.0, source: 'direct' }
  if (userName && resolver) {
    const result = await resolver.resolveUser(userName, requestingUserId)
    if (result.userId) return result
    throw new Error(
      `Could not resolve user "${userName}": ${result.ambiguity ? 'ambiguous matches' : 'not found'}`
    )
  }
  throw new Error('Either userId or userName must be provided')
}

/**
 * Find an existing DM room with a user, checking the cache first.
 *
 * @param {Object} client - Matrix SDK client.
 * @param {string} userId - Target user ID.
 * @param {Object} mcpDataStore - DM cache store.
 * @returns {Promise<string|null>} Room ID or null.
 */
async function findExistingDM(client, userId, mcpDataStore) {
  if (mcpDataStore?.hasDMRoom(userId)) {
    return mcpDataStore.getDMRoom(userId)
  }
  try {
    const joinedRooms = await client.getJoinedRooms()
    for (const roomId of joinedRooms) {
      try {
        const state = await client.getRoomState(roomId)
        const createEvent = state.find((e) => e.type === 'm.room.create')
        const memberEvents = state.filter(
          (e) => e.type === 'm.room.member' && e.content?.membership === 'join'
        )
        if (createEvent?.content?.is_direct === true) {
          const memberIds = memberEvents.map((e) => e.state_key)
          const botUserId = await client.getUserId()
          if (memberIds.includes(userId) && memberIds.includes(botUserId)) {
            mcpDataStore?.setDMRoom(userId, roomId)
            return roomId
          }
        }
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Create a new encrypted DM room with a user.
 *
 * @param {Object} client - Matrix SDK client.
 * @param {string} userId - Target user ID.
 * @param {Object} mcpDataStore - DM cache store.
 * @returns {Promise<string>} New room ID.
 */
async function createDM(client, userId, mcpDataStore) {
  const createResult = await client.createRoom({
    preset: 'trusted_private_chat',
    invite: [userId],
    is_direct: true,
    initial_state: [
      { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    ],
  })
  const roomId = createResult?.room_id ?? createResult
  mcpDataStore?.setDMRoom(userId, roomId)
  return roomId
}

// ──────────────────────────────────────────────────────────────────────────
// Tool Definitions
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build the array of MCP tool definitions.
 *
 * Exported separately as `getTools` for unit testing — allows testing tool
 * execution without starting a full HTTP server.
 *
 * @param {Object} matrixClient - Matrix SDK client.
 * @param {Object} config - Server configuration.
 * @param {Object} config.aliasStore - AliasStore instance.
 * @param {Object} config.mcpDataStore - McpDataStore instance.
 * @param {Object} config.resolver - MatrixIdResolver instance.
 * @param {string} config.homeserverUrl - Matrix homeserver URL.
 * @param {string} config.serverName - Matrix server name (for constructing user IDs).
 * @returns {Array} Array of tool definition objects.
 */
export function getTools(matrixClient, config) {
  const { aliasStore, mcpDataStore, resolver } = config

  return [
    // ── Messaging Tools ──────────────────────────────────────────────

    {
      name: 'send_message',
      description:
        'Send a text message to a Matrix room. Accepts either roomId (exact) or roomName (resolved).',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        message: schemas.message,
      },
      execute: async ({ roomId, roomName, message }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const resolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          await matrixClient.sendText(resolution.roomId, message)
          return success({
            roomId: resolution.roomId,
            resolution: { confidence: resolution.confidence, source: resolution.source },
          })
        }),
    },

    {
      name: 'send_html_message',
      description: 'Send an HTML formatted message to a Matrix room.',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        html: z.string().describe('HTML content'),
        text: z.string().optional().describe('Plain text fallback'),
      },
      execute: async ({ roomId, roomName, html, text }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const resolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          await matrixClient.sendHtmlText(resolution.roomId, html, text)
          return success({
            roomId: resolution.roomId,
            resolution: { confidence: resolution.confidence, source: resolution.source },
          })
        }),
    },

    {
      name: 'send_reaction',
      description: 'Send an emoji reaction to a message in a Matrix room.',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        eventId: z.string().describe('Event ID of the message to react to'),
        emoji: schemas.emoji,
      },
      execute: async ({ roomId, roomName, eventId, emoji }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const resolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          await matrixClient.sendReaction(resolution.roomId, eventId, emoji)
          return success({ roomId: resolution.roomId, eventId, emoji })
        }),
    },

    {
      name: 'send_dm',
      description:
        'Send a direct message to a user. Creates an encrypted DM room if one does not exist.',
      inputSchema: {
        userId: schemas.userId.optional(),
        userName: schemas.userName,
        message: schemas.message,
        forceNew: z
          .boolean()
          .optional()
          .describe('Create a new DM room even if a cached room exists'),
      },
      execute: async ({ userId, userName, message, forceNew }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const userResolution = await resolveUserInput(userId, userName, uid, resolver)
          const targetUserId = userResolution.userId

          let dmRoomId = forceNew
            ? null
            : await findExistingDM(matrixClient, targetUserId, mcpDataStore)
          let dmCreated = false

          if (!dmRoomId) {
            dmRoomId = await createDM(matrixClient, targetUserId, mcpDataStore)
            dmCreated = true
          }

          await matrixClient.sendText(dmRoomId, message)
          return success({
            dmRoomId,
            userId: targetUserId,
            dmCreated,
            userResolution: {
              confidence: userResolution.confidence,
              source: userResolution.source,
            },
          })
        }),
    },

    // ── Room Management Tools ────────────────────────────────────────

    {
      name: 'join_room',
      description: 'Join a Matrix room by ID or alias.',
      inputSchema: { roomIdOrAlias: schemas.roomIdOrAlias },
      execute: async ({ roomIdOrAlias }) =>
        withErrorHandling(async () => {
          const joinedRoomId = await matrixClient.joinRoom(roomIdOrAlias)
          return success({ roomId: joinedRoomId })
        }),
    },

    {
      name: 'leave_room',
      description: 'Leave a Matrix room.',
      inputSchema: {
        roomId: schemas.roomId,
        reason: z.string().optional().describe('Optional reason for leaving'),
      },
      execute: async ({ roomId, reason }) =>
        withErrorHandling(async () => {
          await matrixClient.leaveRoom(roomId, reason)
          return success({ roomId })
        }),
    },

    {
      name: 'get_joined_rooms',
      description: 'Get the list of rooms the bot has joined.',
      inputSchema: {},
      execute: async () =>
        withErrorHandling(async () => {
          const rooms = await matrixClient.getJoinedRooms()
          return success({ rooms })
        }),
    },

    {
      name: 'get_room_messages',
      description: 'Get recent messages from a Matrix room.',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        limit: schemas.limit,
      },
      execute: async ({ roomId, roomName, limit }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const resolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          const messages = await matrixClient.getRoomMessages(resolution.roomId, limit)
          return success({
            roomId: resolution.roomId,
            messages,
            resolution: { confidence: resolution.confidence, source: resolution.source },
          })
        }),
    },

    // ── User Management Tools ────────────────────────────────────────

    {
      name: 'get_presence',
      description:
        'Get presence status for a user. Accepts either userId (exact) or userName (resolved).',
      inputSchema: {
        userId: schemas.userId.optional(),
        userName: schemas.userName,
      },
      execute: async ({ userId, userName }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const resolution = await resolveUserInput(userId, userName, uid, resolver)
          const presence = await matrixClient.getPresence(resolution.userId)
          return success({
            userId: resolution.userId,
            presence,
            resolution: { confidence: resolution.confidence, source: resolution.source },
          })
        }),
    },

    {
      name: 'invite_user',
      description: 'Invite a user to a room.',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        userId: schemas.userId.optional(),
        userName: schemas.userName,
      },
      execute: async ({ roomId, roomName, userId, userName }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const roomResolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          const userResolution = await resolveUserInput(userId, userName, uid, resolver)
          await matrixClient.inviteUser(userResolution.userId, roomResolution.roomId)
          return success({ roomId: roomResolution.roomId, userId: userResolution.userId })
        }),
    },

    {
      name: 'kick_user',
      description: 'Kick a user from a room.',
      inputSchema: {
        roomId: schemas.roomId.optional(),
        roomName: schemas.roomName,
        userId: schemas.userId.optional(),
        userName: schemas.userName,
        reason: z.string().optional().describe('Reason for kick'),
      },
      execute: async ({ roomId, roomName, userId, userName, reason }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const roomResolution = await resolveRoomInput(roomId, roomName, uid, resolver)
          const userResolution = await resolveUserInput(userId, userName, uid, resolver)
          await matrixClient.kickUser(userResolution.userId, roomResolution.roomId, reason)
          return success({ roomId: roomResolution.roomId, userId: userResolution.userId })
        }),
    },

    // ── ID Resolution Tools ──────────────────────────────────────────

    {
      name: 'set_room_alias',
      description:
        'Teach the bot a user-defined alias for a room. Example: alias "eng" → "!abc123:matrix.org".',
      inputSchema: {
        alias: schemas.alias,
        roomId: schemas.roomId,
      },
      execute: async ({ alias, roomId }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const currentRoomId = context?.roomId || roomId
          aliasStore.setRoomAlias(currentRoomId, uid, alias, roomId)
          return success({
            alias,
            roomId,
            message: `Room alias "${alias}" → "${roomId}" saved for user ${uid}`,
          })
        }),
    },

    {
      name: 'set_user_alias',
      description:
        'Teach the bot a user-defined alias for a user. Example: alias "alice" → "@alice:matrix.org".',
      inputSchema: {
        alias: schemas.alias,
        userId: schemas.userId,
      },
      execute: async ({ alias, userId }, context) =>
        withErrorHandling(async () => {
          const uid = context?.userId || '@agent:localhost'
          const currentRoomId = context?.roomId || '!unknown:localhost'
          aliasStore.setUserAlias(currentRoomId, uid, alias, userId)
          return success({
            alias,
            userId,
            message: `User alias "${alias}" → "${userId}" saved for user ${uid}`,
          })
        }),
    },

    {
      name: 'resolve_room',
      description:
        'Resolve a room name to its Matrix ID. Returns confidence score and resolution source.',
      inputSchema: {
        roomName: schemas.roomName.describe('Room name to resolve (required)'),
        currentRoomId: z
          .string()
          .optional()
          .describe('Current room context for ambiguity resolution'),
      },
      execute: async ({ roomName, currentRoomId }, context) =>
        withErrorHandling(async () => {
          if (!resolver) throw new Error('ID resolver not available')
          const uid = context?.userId || '@agent:localhost'
          const result = await resolver.resolveRoom(roomName, uid, { currentRoomId })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: !!result.roomId,
                    roomId: result.roomId || null,
                    confidence: result.confidence,
                    source: result.source,
                    name: result.name,
                    ambiguity: result.ambiguity || false,
                    candidates: result.candidates || null,
                    message: result.roomId
                      ? `Resolved "${roomName}" → "${result.roomId}" (confidence: ${result.confidence})`
                      : `Could not resolve "${roomName}"`,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }),
    },

    {
      name: 'resolve_user',
      description:
        'Resolve a user name to their Matrix ID. Returns confidence score and resolution source.',
      inputSchema: {
        userName: schemas.userName.describe('User name to resolve (required)'),
      },
      execute: async ({ userName }, context) =>
        withErrorHandling(async () => {
          if (!resolver) throw new Error('ID resolver not available')
          const uid = context?.userId || '@agent:localhost'
          const result = await resolver.resolveUser(userName, uid)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: !!result.userId,
                    userId: result.userId || null,
                    confidence: result.confidence,
                    source: result.source,
                    name: result.name,
                    ambiguity: result.ambiguity || false,
                    candidates: result.candidates || null,
                    message: result.userId
                      ? `Resolved "${userName}" → "${result.userId}" (confidence: ${result.confidence})`
                      : `Could not resolve "${userName}"`,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }),
    },
  ]
}

// ──────────────────────────────────────────────────────────────────────────
// Server Factory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create the Matrix MCP Server.
 *
 * @param {Object} matrixClient - The bot's Matrix client instance.
 * @param {Object} config - Server configuration.
 * @param {Object} config.aliasStore - AliasStore for room/user aliases.
 * @param {Object} config.mcpDataStore - McpDataStore for DM room caching.
 * @param {Object} config.resolver - MatrixIdResolver instance.
 * @param {string} [config.homeserverUrl] - Matrix homeserver URL.
 * @param {string} [config.serverName] - Matrix server name for ID construction.
 * @param {number} [config.port=3456] - HTTP server port.
 * @param {string} [config.host='0.0.0.0'] - HTTP server bind address.
 * @returns {Object} SimpleServer instance with start/stop methods.
 */
export function createMatrixMcpServer(matrixClient, config = {}) {
  const port = config.port || 3456
  const host = config.host || '0.0.0.0'
  const tools = getTools(matrixClient, config)

  const serverConfig = {
    name: 'matrix-mcp-server',
    version: '2.0.0',
    server: {
      connection: { type: 'http', port, host },
    },
    tools,
  }

  const server = createSimpleServer(serverConfig)

  console.info(`[MatrixMCP] Server configured on ${host}:${port}`)
  console.info(`[MatrixMCP] ${tools.length} tools registered`)
  if (config.resolver) {
    console.info('[MatrixMCP] ID translation layer enabled')
  }

  return server
}

export default createMatrixMcpServer
