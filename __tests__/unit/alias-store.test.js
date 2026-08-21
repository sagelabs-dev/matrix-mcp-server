import { describe, it, expect, beforeEach } from 'vitest'
import { AliasStore } from '../../src/alias-store.js'

describe('AliasStore', () => {
  let store

  beforeEach(() => {
    store = new AliasStore()
  })

  describe('room aliases', () => {
    it('setRoomAlias stores and getRoomAlias retrieves a room alias', () => {
      store.setRoomAlias('!room1:server', '@user:server', 'eng', '!eng:server')
      expect(store.getRoomAlias('!room1:server', '@user:server', 'eng')).toBe('!eng:server')
    })

    it('getRoomAlias returns null for non-existent alias', () => {
      expect(store.getRoomAlias('!room1:server', '@user:server', 'unknown')).toBeNull()
    })

    it('aliases are per-user (different users can have different aliases)', () => {
      store.setRoomAlias('!room1:server', '@alice:server', 'eng', '!eng:server')
      store.setRoomAlias('!room1:server', '@bob:server', 'eng', '!engineering:server')
      expect(store.getRoomAlias('!room1:server', '@alice:server', 'eng')).toBe('!eng:server')
      expect(store.getRoomAlias('!room1:server', '@bob:server', 'eng')).toBe('!engineering:server')
    })

    it('case-insensitive lookup works', () => {
      store.setRoomAlias('!room1:server', '@user:server', 'Engineering', '!eng:server')
      expect(store.getRoomAlias('!room1:server', '@user:server', 'engineering')).toBe('!eng:server')
      expect(store.getRoomAlias('!room1:server', '@user:server', 'ENGINEERING')).toBe('!eng:server')
    })

    it('overwriting an alias updates the value', () => {
      store.setRoomAlias('!room1:server', '@user:server', 'eng', '!old:server')
      store.setRoomAlias('!room1:server', '@user:server', 'eng', '!new:server')
      expect(store.getRoomAlias('!room1:server', '@user:server', 'eng')).toBe('!new:server')
    })
  })

  describe('user aliases', () => {
    it('setUserAlias stores and getUserAlias retrieves a user alias', () => {
      store.setUserAlias('!room1:server', '@user:server', 'alice', '@alice:matrix.org')
      expect(store.getUserAlias('!room1:server', '@user:server', 'alice')).toBe('@alice:matrix.org')
    })

    it('getUserAlias returns null for non-existent alias', () => {
      expect(store.getUserAlias('!room1:server', '@user:server', 'nobody')).toBeNull()
    })

    it('aliases are per-user', () => {
      store.setUserAlias('!room1:server', '@alice:server', 'bob', '@bob:server')
      store.setUserAlias('!room1:server', '@carol:server', 'bob', '@robert:server')
      expect(store.getUserAlias('!room1:server', '@alice:server', 'bob')).toBe('@bob:server')
      expect(store.getUserAlias('!room1:server', '@carol:server', 'bob')).toBe('@robert:server')
    })

    it('case-insensitive lookup works', () => {
      store.setUserAlias('!room1:server', '@user:server', 'Alice', '@alice:matrix.org')
      expect(store.getUserAlias('!room1:server', '@user:server', 'alice')).toBe('@alice:matrix.org')
    })
  })

  describe('persistence', () => {
    it('toJSON serializes to a plain object', () => {
      store.setRoomAlias('!room1:server', '@user:server', 'eng', '!eng:server')
      store.setUserAlias('!room1:server', '@user:server', 'alice', '@alice:matrix.org')
      const json = store.toJSON()
      expect(typeof json).toBe('string')
      const parsed = JSON.parse(json)
      expect(parsed.rooms['@user:server'].eng).toBe('!eng:server')
      expect(parsed.users['@user:server'].alice).toBe('@alice:matrix.org')
    })

    it('constructor restores from persisted data', () => {
      store.setRoomAlias('!room1:server', '@user:server', 'eng', '!eng:server')
      store.setUserAlias('!room1:server', '@user:server', 'alice', '@alice:matrix.org')
      const json = store.toJSON()

      const restored = new AliasStore(JSON.parse(json))
      expect(restored.getRoomAlias('!room1:server', '@user:server', 'eng')).toBe('!eng:server')
      expect(restored.getUserAlias('!room1:server', '@user:server', 'alice')).toBe(
        '@alice:matrix.org'
      )
    })

    it('empty store serializes and restores correctly', () => {
      const json = store.toJSON()
      const restored = new AliasStore(JSON.parse(json))
      expect(restored.getRoomAlias('!r:s', '@u:s', 'x')).toBeNull()
      expect(restored.getUserAlias('!r:s', '@u:s', 'x')).toBeNull()
    })

    it('handles partial data (only rooms, no users)', () => {
      const partial = { rooms: { '@user:server': { eng: '!eng:server' } } }
      const restored = new AliasStore(partial)
      expect(restored.getRoomAlias('!r:s', '@user:server', 'eng')).toBe('!eng:server')
      expect(restored.getUserAlias('!r:s', '@user:server', 'alice')).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('getRoomAlias for a user with no aliases returns null', () => {
      expect(store.getRoomAlias('!room:server', '@new:server', 'anything')).toBeNull()
    })

    it('getUserAlias for a user with no aliases returns null', () => {
      expect(store.getUserAlias('!room:server', '@new:server', 'anything')).toBeNull()
    })
  })
})
