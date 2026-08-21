/**
 * McpDataStore - Persistent data storage for MCP tool caches
 * 
 * Stores:
 * - DM room IDs: { targetUserId: roomId }
 * - Room aliases: { alias: roomId }
 * - User aliases: { alias: userId }
 * 
 * Persisted via DataManager (interval + exit saves)
 */

export { McpDataStore }

class McpDataStore {
  #data

  constructor(initialData = {}) {
    // Initialize with defaults, merge persisted data
    this.#data = {
      dmRooms: {},
      roomAliases: {},
      userAliases: {},
      lastUpdated: null,
      ...initialData
    }

    // Deep merge for nested objects (in case partial data loaded)
    if (initialData.dmRooms) {
      this.#data.dmRooms = { ...this.#data.dmRooms, ...initialData.dmRooms }
    }
    if (initialData.roomAliases) {
      this.#data.roomAliases = { ...this.#data.roomAliases, ...initialData.roomAliases }
    }
    if (initialData.userAliases) {
      this.#data.userAliases = { ...this.#data.userAliases, ...initialData.userAliases }
    }
  }

  // ==================== DM ROOM CACHE ====================
  
  /**
   * Get cached DM room ID for a user
   * @param {string} targetUserId - The user ID to look up
   * @returns {string|null} - Room ID or null if not cached
   */
  getDMRoom(targetUserId) {
    return this.#data.dmRooms[targetUserId] || null
  }

  /**
   * Cache a DM room ID for a user
   * @param {string} targetUserId - The user ID
   * @param {string} roomId - The DM room ID
   */
  setDMRoom(targetUserId, roomId) {
    this.#data.dmRooms[targetUserId] = roomId
    this.#data.lastUpdated = Date.now()
  }

  /**
   * Check if DM room is cached for a user
   * @param {string} targetUserId - The user ID
   * @returns {boolean}
   */
  hasDMRoom(targetUserId) {
    return targetUserId in this.#data.dmRooms
  }

  /**
   * Remove cached DM room for a user
   * @param {string} targetUserId - The user ID
   */
  clearDMRoom(targetUserId) {
    delete this.#data.dmRooms[targetUserId]
    this.#data.lastUpdated = Date.now()
  }

  // ==================== ROOM ALIAS CACHE ====================
  
  /**
   * Get cached room ID for an alias
   * @param {string} alias - The room alias
   * @returns {string|null}
   */
  getRoomAlias(alias) {
    return this.#data.roomAliases[alias] || null
  }

  /**
   * Cache a room alias
   * @param {string} alias - The alias name
   * @param {string} roomId - The room ID
   */
  setRoomAlias(alias, roomId) {
    this.#data.roomAliases[alias] = roomId
    this.#data.lastUpdated = Date.now()
  }

  /**
   * Check if room alias exists
   * @param {string} alias
   * @returns {boolean}
   */
  hasRoomAlias(alias) {
    return alias in this.#data.roomAliases
  }

  // ==================== USER ALIAS CACHE ====================
  
  /**
   * Get cached user ID for an alias
   * @param {string} alias - The user alias
   * @returns {string|null}
   */
  getUserAlias(alias) {
    return this.#data.userAliases[alias] || null
  }

  /**
   * Cache a user alias
   * @param {string} alias - The alias name
   * @param {string} userId - The user ID
   */
  setUserAlias(alias, userId) {
    this.#data.userAliases[alias] = userId
    this.#data.lastUpdated = Date.now()
  }

  /**
   * Check if user alias exists
   * @param {string} alias
   * @returns {boolean}
   */
  hasUserAlias(alias) {
    return alias in this.#data.userAliases
  }

  // ==================== PERSISTENCE ====================
  
  /**
   * Serialize to JSON for DataManager
   * @returns {String}
   */
  toJSON() {
    return JSON.stringify(this.#data)
  }

  /**
   * Get stats for debugging
   * @returns {String}
   */
  getStats() {
    return {
      dmRoomsCount: Object.keys(this.#data.dmRooms).length,
      roomAliasesCount: Object.keys(this.#data.roomAliases).length,
      userAliasesCount: Object.keys(this.#data.userAliases).length,
      lastUpdated: this.#data.lastUpdated
    }
  }
}
