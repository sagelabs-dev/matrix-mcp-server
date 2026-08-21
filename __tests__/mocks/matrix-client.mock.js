/**
 * MatrixClient Mock — Mock implementation of @vector-im/matrix-bot-sdk MatrixClient
 * for unit testing without a live Matrix server.
 *
 * Provides configurable method stubs with sensible defaults for all methods
 * used by the MCP server and ID resolver.
 *
 * @module matrix-client.mock
 */

/**
 * Create a mock MatrixClient.
 *
 * @param {Object} [overrides] - Override specific methods or return values.
 * @returns {Object} Mock client with MatrixClient-like interface.
 */
export function createMockMatrixClient(overrides = {}) {
  const defaults = {
    // Identity
    getUserId: async () => '@bot:matrix.org',

    // Room discovery
    getJoinedRooms: async () => ['!room1:matrix.org', '!room2:matrix.org'],

    // Room state
    getRoomState: async (roomId) => {
      const state = []
      // m.room.create
      state.push({
        type: 'm.room.create',
        content: { creator: '@bot:matrix.org', is_direct: false },
      })
      // m.room.name
      if (roomId === '!room1:matrix.org') {
        state.push({ type: 'm.room.name', content: { name: 'Engineering' } })
        state.push({
          type: 'm.room.canonical_alias',
          content: { alias: '#engineering:matrix.org' },
        })
      }
      if (roomId === '!room2:matrix.org') {
        state.push({ type: 'm.room.name', content: { name: 'General' } })
        state.push({
          type: 'm.room.canonical_alias',
          content: { alias: '#general:matrix.org' },
        })
      }
      // Members
      state.push({ type: 'm.room.member', state_key: '@bot:matrix.org', content: { membership: 'join' } })
      state.push({ type: 'm.room.member', state_key: '@alice:matrix.org', content: { membership: 'join' } })
      state.push({ type: 'm.room.member', state_key: '@bob:matrix.org', content: { membership: 'join' } })
      return state
    },

    // Room members
    getRoomMembers: async (roomId) => [
      { userId: '@bot:matrix.org' },
      { userId: '@alice:matrix.org' },
      { userId: '@bob:matrix.org' },
    ],

    // User profiles
    getUserProfile: async (userId) => {
      const profiles = {
        '@alice:matrix.org': { displayname: 'Alice' },
        '@bob:matrix.org': { displayname: 'Bob' },
        '@bot:matrix.org': { displayname: 'GuanBot' },
      }
      return profiles[userId] || { displayname: userId }
    },

    // Presence
    getPresence: async (userId) => ({
      presence: 'online',
      status_msg: 'Available',
    }),

    // Messaging
    sendText: async (roomId, text) => '$event:text:' + roomId + ':' + text.slice(0, 20),
    sendHtmlText: async (roomId, html, text) => '$event:html:' + roomId + ':' + (html || text || '').slice(0, 20),
    sendReaction: async (roomId, eventId, emoji) => '$event:reaction:' + roomId,
    sendNotice: async (roomId, text) => '$event:notice:' + roomId,

    // Room management
    joinRoom: async (roomIdOrAlias) => '!joined:matrix.org',
    leaveRoom: async (roomId, reason) => undefined,

    // Room messages
    getRoomMessages: async (roomId, limit = 50) => [
      { eventId: '$ev1', body: 'Hello', sender: '@alice:matrix.org' },
      { eventId: '$ev2', body: 'World', sender: '@bob:matrix.org' },
    ],

    // User management
    inviteUser: async (userId, roomId) => undefined,
    kickUser: async (userId, roomId, reason) => undefined,

    // Room creation
    createRoom: async (opts) => ({ room_id: '!new:matrix.org' }),

    // Misc
    mxcToHttp: (mxc) => mxc,
    downloadContent: async (url) => ({ body: Buffer.from('') }),
    uploadContent: async (data, contentType, fileName) => 'mxc://matrix.org/upload',
  }

  return { ...defaults, ...overrides }
}
