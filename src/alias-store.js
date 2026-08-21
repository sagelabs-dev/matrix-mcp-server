/**
 * AliasStore — Minimal per-user alias storage for Matrix room/user ID resolution.
 *
 * Replaces the 695-line Sessions class from guan-matrix-chat. The MCP server only
 * needs four methods: getRoomAlias, setRoomAlias, getUserAlias, setUserAlias.
 *
 * Aliases are stored per-user (keyed by uid). The rid parameter is accepted for
 * interface compatibility with the original Sessions API but is not used as a
 * storage key — aliases are global to the user, not scoped per room.
 *
 * @module alias-store
 */

/**
 * @class AliasStore
 */
export class AliasStore {

  /** @type {{ rooms: Object<string, Object<string, string>>, users: Object<string, Object<string, string>> }} */
  #data

  /**
   * Create a new AliasStore, optionally restoring from persisted data.
   *
   * @param {Object} [initialData] - Previously serialized data (from toJSON / loadJson).
   * @param {Object<string, Object<string, string>>} [initialData.rooms] - Map of userId → { alias → roomId }.
   * @param {Object<string, Object<string, string>>} [initialData.users] - Map of userId → { alias → targetUserId }.
   */
  constructor(initialData = {}) {
    this.#data = {
      rooms: initialData.rooms ?? {},
      users: initialData.users ?? {},
    }
  }

  /**
   * Get a room alias for a user.
   *
   * @param {string} _rid - Room context (unused — aliases are per-user).
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias to look up.
   * @returns {string|null} The room ID, or null if not found.
   */
  getRoomAlias(_rid, uid, alias) {
    return this.#lookup('rooms', uid, alias)
  }

  /**
   * Set a room alias for a user.
   *
   * @param {string} _rid - Room context (unused — aliases are per-user).
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias to set.
   * @param {string} roomId - The Matrix room ID to associate with the alias.
   * @returns {AliasStore} This instance, for chaining.
   */
  setRoomAlias(_rid, uid, alias, roomId) {
    this.#store('rooms', uid, alias, roomId)
    return this
  }

  /**
   * Get a user alias for a user.
   *
   * @param {string} _rid - Room context (unused — aliases are per-user).
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias to look up.
   * @returns {string|null} The target user ID, or null if not found.
   */
  getUserAlias(_rid, uid, alias) {
    return this.#lookup('users', uid, alias)
  }

  /**
   * Set a user alias for a user.
   *
   * @param {string} _rid - Room context (unused — aliases are per-user).
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias to set.
   * @param {string} userId - The target Matrix user ID.
   * @returns {AliasStore} This instance, for chaining.
   */
  setUserAlias(_rid, uid, alias, userId) {
    this.#store('users', uid, alias, userId)
    return this
  }

  /**
   * Serialize the store to a JSON string for persistence.
   *
   * @returns {string} JSON representation of the store.
   */
  toJSON() {
    return JSON.stringify(this.#data)
  }

  /**
   * Look up a value with case-insensitive fallback.
   *
   * @param {'rooms'|'users'} category - The alias category.
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias to look up.
   * @returns {string|null} The stored value, or null.
   * @private
   */
  #lookup(category, uid, alias) {
    const table = this.#data[category][uid]
    if (!table) return null

    // Exact match first (fast path)
    if (Object.hasOwn(table, alias)) return table[alias]

    // Case-insensitive fallback
    const lower = alias.toLowerCase()
    for (const key of Object.keys(table)) {
      if (key.toLowerCase() === lower) return table[key]
    }

    return null
  }

  /**
   * Store a value.
   *
   * @param {'rooms'|'users'} category - The alias category.
   * @param {string} uid - The user's Matrix ID.
   * @param {string} alias - The alias key.
   * @param {string} value - The value to store.
   * @private
   */
  #store(category, uid, alias, value) {
    if (!this.#data[category][uid]) {
      this.#data[category][uid] = {}
    }
    this.#data[category][uid][alias] = value
  }
}
