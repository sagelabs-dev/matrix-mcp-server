import { describe, it, expect, beforeEach } from 'vitest'
import { McpDataStore } from '../../src/mcp-data-store.js'

describe('McpDataStore', () => {
  let store

  beforeEach(() => {
    store = new McpDataStore()
  })

  describe('DM room cache', () => {
    it('setDMRoom and getDMRoom', () => {
      store.setDMRoom('@user:server', '!room:server')
      expect(store.getDMRoom('@user:server')).toBe('!room:server')
    })

    it('getDMRoom returns null for uncached user', () => {
      expect(store.getDMRoom('@unknown:server')).toBeNull()
    })

    it('hasDMRoom returns true/false correctly', () => {
      store.setDMRoom('@user:server', '!room:server')
      expect(store.hasDMRoom('@user:server')).toBe(true)
      expect(store.hasDMRoom('@unknown:server')).toBe(false)
    })

    it('clearDMRoom removes the cached entry', () => {
      store.setDMRoom('@user:server', '!room:server')
      store.clearDMRoom('@user:server')
      expect(store.hasDMRoom('@user:server')).toBe(false)
      expect(store.getDMRoom('@user:server')).toBeNull()
    })
  })

  describe('room aliases (direct cache)', () => {
    it('setRoomAlias and getRoomAlias', () => {
      store.setRoomAlias('eng', '!eng:server')
      expect(store.getRoomAlias('eng')).toBe('!eng:server')
    })

    it('getRoomAlias returns null for non-existent', () => {
      expect(store.getRoomAlias('unknown')).toBeNull()
    })

    it('hasRoomAlias works', () => {
      store.setRoomAlias('eng', '!eng:server')
      expect(store.hasRoomAlias('eng')).toBe(true)
      expect(store.hasRoomAlias('unknown')).toBe(false)
    })
  })

  describe('user aliases (direct cache)', () => {
    it('setUserAlias and getUserAlias', () => {
      store.setUserAlias('alice', '@alice:matrix.org')
      expect(store.getUserAlias('alice')).toBe('@alice:matrix.org')
    })

    it('hasUserAlias works', () => {
      store.setUserAlias('alice', '@alice:matrix.org')
      expect(store.hasUserAlias('alice')).toBe(true)
      expect(store.hasUserAlias('bob')).toBe(false)
    })
  })

  describe('persistence', () => {
    it('toJSON serializes to a JSON string', () => {
      store.setDMRoom('@user:server', '!room:server')
      store.setRoomAlias('eng', '!eng:server')
      store.setUserAlias('alice', '@alice:matrix.org')

      const json = store.toJSON()
      expect(typeof json).toBe('string')
      const parsed = JSON.parse(json)
      expect(parsed.dmRooms['@user:server']).toBe('!room:server')
      expect(parsed.roomAliases.eng).toBe('!eng:server')
      expect(parsed.userAliases.alice).toBe('@alice:matrix.org')
    })

    it('constructor restores from persisted data', () => {
      store.setDMRoom('@user:server', '!room:server')
      store.setRoomAlias('eng', '!eng:server')
      const json = store.toJSON()

      const restored = new McpDataStore(JSON.parse(json))
      expect(restored.getDMRoom('@user:server')).toBe('!room:server')
      expect(restored.getRoomAlias('eng')).toBe('!eng:server')
    })
  })

  describe('getStats', () => {
    it('returns correct counts', () => {
      store.setDMRoom('@user:server', '!room:server')
      store.setRoomAlias('eng', '!eng:server')
      store.setUserAlias('alice', '@alice:matrix.org')

      const stats = store.getStats()
      expect(stats.dmRoomsCount).toBe(1)
      expect(stats.roomAliasesCount).toBe(1)
      expect(stats.userAliasesCount).toBe(1)
    })
  })
})
