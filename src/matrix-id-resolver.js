/**
 * MatrixIdResolver — Human-friendly Matrix room/user ID resolution.
 *
 * Enables natural language references like "engineering" or "Alice" instead of
 * opaque Matrix IDs like "!abc123:matrix.org" or "@alice:matrix.org".
 *
 * Resolution Strategy (Hybrid):
 *   1. User-defined aliases (highest priority, confidence: 1.0)
 *   2. Exact display name match (confidence: 0.9)
 *   3. Partial/fuzzy match (confidence: 0.7)
 *   4. Multiple matches → ambiguity (confidence: 0.5)
 *
 * Uses on-demand scanning (no caching per user preference).
 *
 * @module matrix-id-resolver
 */

export { MatrixIdResolver }

/**
 * Resolves human-friendly names to Matrix IDs.
 */
class MatrixIdResolver {

  #_log
  #_matrixClient
  #_aliasStore

  /**
   * Create a new MatrixIdResolver.
   *
   * @param {Object} deps - Dependencies
   * @param {Function} deps.log - Logger function.
   * @param {Object} deps.matrixClient - Matrix SDK client instance.
   * @param {Object} deps.aliasStore - AliasStore instance for alias lookups.
   */
  constructor({ log, matrixClient, aliasStore }) {
    this.#_log = log
    this.#_matrixClient = matrixClient
    this.#_aliasStore = aliasStore
  }

  // ==========================================================================
  // Room Resolution
  // ==========================================================================

  /**
   * Resolve a room name to a Matrix room ID.
   *
   * @param {string} roomName - The room name to resolve (e.g., "engineering", "general").
   * @param {string} userId - The requesting user's Matrix ID.
   * @param {Object} [options] - Optional parameters.
   * @param {string} [options.currentRoomId] - Current room context for ambiguity resolution.
   * @returns {Promise<Object>} Resolution result with roomId, confidence, source.
   */
  async resolveRoom(roomName, userId, options = {}) {
    const { currentRoomId } = options
    const normalizedName = roomName.toLowerCase().trim()

    // Layer 1: User aliases (confidence: 1.0)
    const aliasMatch = this.#_aliasStore.getRoomAlias(currentRoomId, userId, roomName)
    if (aliasMatch) {
      return { roomId: aliasMatch, confidence: 1.0, source: 'user_alias', name: roomName }
    }

    try {
      // Layer 2-4: Scan joined rooms
      const rooms = await this.#scanJoinedRooms()
      const candidates = []

      for (const room of rooms) {
        const roomDisplayName = (room.name || '').toLowerCase()
        const roomCanonicalAlias = (room.canonicalAlias || '').toLowerCase()
        const roomAltAliases = (room.altAliases || []).map(a => a.toLowerCase())

        if (roomDisplayName === normalizedName ||
            roomCanonicalAlias === normalizedName ||
            roomAltAliases.includes(normalizedName)) {
          candidates.push({ roomId: room.id, name: room.name || room.canonicalAlias || room.id, memberCount: room.memberCount || 0, matchType: 'exact', confidence: 0.9 })
        } else if (roomDisplayName.includes(normalizedName) || normalizedName.includes(roomDisplayName)) {
          candidates.push({ roomId: room.id, name: room.name || room.canonicalAlias || room.id, memberCount: room.memberCount || 0, matchType: 'partial', confidence: 0.7 })
        }
      }

      if (candidates.length === 0) {
        return { error: `Room "${roomName}" not found`, confidence: 0, source: 'not_found' }
      }

      if (candidates.length === 1) {
        const c = candidates[0]
        return { roomId: c.roomId, confidence: c.confidence, source: c.matchType, name: c.name }
      }

      // Multiple matches — prefer exact
      const exactMatches = candidates.filter(c => c.matchType === 'exact')
      if (exactMatches.length === 1) {
        const c = exactMatches[0]
        return { roomId: c.roomId, confidence: c.confidence, source: c.matchType, name: c.name }
      }

      return {
        ambiguity: true,
        message: `Multiple rooms match "${roomName}":`,
        candidates: candidates.map((c, i) => ({ index: i + 1, roomId: c.roomId, name: c.name, memberCount: c.memberCount, confidence: c.confidence })),
        confidence: 0.5,
        instruction: 'Reply with the number (1, 2, etc.) or "none"',
      }
    } catch (error) {
      this.#_log('error', '[MatrixIdResolver]', `Error resolving room "${roomName}":`, error.message)
      return { error: `Failed to resolve room: ${error.message}`, confidence: 0, source: 'error' }
    }
  }

  /**
   * Scan all joined rooms and extract their metadata.
   *
   * @returns {Promise<Array>} Array of room metadata objects.
   * @private
   */
  async #scanJoinedRooms() {
    try {
      const roomIds = await this.#_matrixClient.getJoinedRooms()
      const rooms = []

      for (const roomId of roomIds) {
        try {
          const stateEvents = await this.#_matrixClient.getRoomState(roomId)
          const nameEvent = stateEvents.find(e => e.type === 'm.room.name')
          const name = nameEvent?.content?.name
          const canonicalAliasEvent = stateEvents.find(e => e.type === 'm.room.canonical_alias')
          const canonicalAlias = canonicalAliasEvent?.content?.alias
          const aliasesEvent = stateEvents.find(e => e.type === 'm.room.aliases')
          const altAliases = aliasesEvent?.content?.aliases || []
          const memberEvents = stateEvents.filter(e => e.type === 'm.room.member')
          rooms.push({ id: roomId, name, canonicalAlias, altAliases, memberCount: memberEvents.length })
        } catch {
          // Skip inaccessible rooms
        }
      }

      return rooms
    } catch (error) {
      this.#_log('error', '[MatrixIdResolver]', 'Error scanning joined rooms:', error.message)
      throw error
    }
  }

  // ==========================================================================
  // User Resolution
  // ==========================================================================

  /**
   * Resolve a user name to a Matrix user ID.
   *
   * @param {string} userName - The user name to resolve (e.g., "Alice", "bob").
   * @param {string} requesterId - The requesting user's Matrix ID.
   * @param {Object} [options] - Optional parameters.
   * @param {string} [options.currentRoomId] - Room context for member search.
   * @returns {Promise<Object>} Resolution result with userId, confidence, source.
   */
  async resolveUser(userName, requesterId, options = {}) {
    const { currentRoomId } = options
    const normalizedName = userName.toLowerCase().trim()
    const searchName = normalizedName.startsWith('@') ? normalizedName.slice(1) : normalizedName

    // Layer 1: User aliases (confidence: 1.0)
    const aliasMatch = this.#_aliasStore.getUserAlias(currentRoomId, requesterId, userName)
    if (aliasMatch) {
      return { userId: aliasMatch, confidence: 1.0, source: 'user_alias', name: userName }
    }

    try {
      const candidates = []
      const roomIds = await this.#_matrixClient.getJoinedRooms()

      for (const roomId of roomIds) {
        try {
          const members = await this.#_matrixClient.getRoomMembers(roomId)

          for (const member of members) {
            let displayName = ''
            let profile = null
            try {
              profile = await this.#_matrixClient.getUserProfile(member.userId)
              displayName = (profile.displayname || '').toLowerCase()
            } catch {
              // Profile not accessible
            }

            const userIdLower = member.userId.toLowerCase()
            const localpart = userIdLower.split(':')[0].replace('@', '')

            if (displayName === searchName) {
              candidates.push({ userId: member.userId, displayName: profile?.displayname || member.userId, roomId, matchType: 'exact_display', confidence: 0.9 })
            } else if (localpart === searchName || userIdLower === searchName) {
              candidates.push({ userId: member.userId, displayName: profile?.displayname || member.userId, roomId, matchType: 'username', confidence: 0.8 })
            } else if (displayName.includes(searchName) || searchName.includes(displayName)) {
              candidates.push({ userId: member.userId, displayName: profile?.displayname || member.userId, roomId, matchType: 'partial', confidence: 0.7 })
            }
          }
        } catch {
          // Skip inaccessible rooms
        }
      }

      // Deduplicate by userId
      const unique = []
      const seen = new Set()
      for (const c of candidates) {
        if (!seen.has(c.userId)) { seen.add(c.userId); unique.push(c) }
      }

      if (unique.length === 0) {
        return { error: `User "${userName}" not found`, confidence: 0, source: 'not_found' }
      }

      if (unique.length === 1) {
        const c = unique[0]
        return { userId: c.userId, confidence: c.confidence, source: c.matchType, displayName: c.displayName }
      }

      const exactMatches = unique.filter(c => c.matchType === 'exact_display')
      if (exactMatches.length === 1) {
        const c = exactMatches[0]
        return { userId: c.userId, confidence: c.confidence, source: c.matchType, displayName: c.displayName }
      }

      return {
        ambiguity: true,
        message: `Multiple users match "${userName}":`,
        candidates: unique.map((c, i) => ({ index: i + 1, userId: c.userId, displayName: c.displayName, confidence: c.confidence })),
        confidence: 0.5,
        instruction: 'Reply with the number (1, 2, etc.) or "none"',
      }
    } catch (error) {
      this.#_log('error', '[MatrixIdResolver]', `Error resolving user "${userName}":`, error.message)
      return { error: `Failed to resolve user: ${error.message}`, confidence: 0, source: 'error' }
    }
  }

  // ==========================================================================
  // DM Management
  // ==========================================================================

  /**
   * Find an existing DM room with a user.
   *
   * @param {string} userId - The target user's Matrix ID.
   * @returns {Promise<string|null>} The DM room ID or null if not found.
   */
  async findExistingDM(userId) {
    try {
      const roomIds = await this.#_matrixClient.getJoinedRooms()

      for (const roomId of roomIds) {
        try {
          const members = await this.#_matrixClient.getRoomMembers(roomId)
          if (members.length === 2) {
            const memberIds = members.map(m => m.userId)
            if (memberIds.includes(userId)) {
              this.#_log('debug', '[MatrixIdResolver]', `Found existing DM with ${userId}: ${roomId}`)
              return roomId
            }
          }
        } catch {
          continue
        }
      }
      return null
    } catch (error) {
      this.#_log('error', '[MatrixIdResolver]', 'Error finding existing DM:', error.message)
      return null
    }
  }

  /**
   * Create a new DM room with a user.
   *
   * @param {string} userId - The target user's Matrix ID.
   * @returns {Promise<string>} The new room ID.
   */
  async createDM(userId) {
    try {
      const createResult = await this.#_matrixClient.createRoom({
        is_direct: true,
        invite: [userId],
        preset: 'trusted_private_chat',
        visibility: 'private',
        initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
      })
      const roomId = createResult?.room_id ?? createResult
      this.#_log('info', '[MatrixIdResolver]', `Created DM room with ${userId}: ${roomId}`)
      return roomId
    } catch (error) {
      this.#_log('error', '[MatrixIdResolver]', `Failed to create DM with ${userId}:`, error.message)
      throw error
    }
  }

  /**
   * Get or create a DM room with a user.
   *
   * @param {string} userId - The target user's Matrix ID.
   * @returns {Promise<Object>} Result with roomId and created flag.
   */
  async getOrCreateDM(userId) {
    const existingRoomId = await this.findExistingDM(userId)
    if (existingRoomId) return { roomId: existingRoomId, created: false }
    const newRoomId = await this.createDM(userId)
    return { roomId: newRoomId, created: true }
  }
}
