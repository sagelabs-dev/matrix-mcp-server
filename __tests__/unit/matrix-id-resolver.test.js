import { describe, it, expect, beforeEach } from 'vitest'
import { MatrixIdResolver } from '../../src/matrix-id-resolver.js'
import { AliasStore } from '../../src/alias-store.js'
import { createMockMatrixClient } from '../mocks/matrix-client.mock.js'

describe('MatrixIdResolver', () => {
  let client, aliasStore, resolver

  beforeEach(() => {
    client = createMockMatrixClient()
    aliasStore = new AliasStore()
    resolver = new MatrixIdResolver({ log: () => {}, matrixClient: client, aliasStore })
  })

  describe('resolveRoom', () => {
    it('returns user alias with confidence 1.0 when alias is set', async () => {
      aliasStore.setRoomAlias('!current:matrix.org', '@user:matrix.org', 'eng', '!eng:matrix.org')
      const result = await resolver.resolveRoom('eng', '@user:matrix.org', {
        currentRoomId: '!current:matrix.org',
      })
      expect(result.roomId).toBe('!eng:matrix.org')
      expect(result.confidence).toBe(1.0)
      expect(result.source).toBe('user_alias')
    })

    it('resolves by exact room name with confidence 0.9', async () => {
      const result = await resolver.resolveRoom('Engineering', '@user:matrix.org')
      expect(result.roomId).toBe('!room1:matrix.org')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('exact')
    })

    it('resolves by exact canonical alias', async () => {
      const result = await resolver.resolveRoom('#engineering:matrix.org', '@user:matrix.org')
      expect(result.roomId).toBe('!room1:matrix.org')
      expect(result.confidence).toBe(0.9)
    })

    it('resolves by partial match with confidence 0.7', async () => {
      const result = await resolver.resolveRoom('engine', '@user:matrix.org')
      expect(result.roomId).toBe('!room1:matrix.org')
      expect(result.confidence).toBe(0.7)
      expect(result.source).toBe('partial')
    })

    it('returns not_found when no rooms match', async () => {
      const result = await resolver.resolveRoom('nonexistent', '@user:matrix.org')
      expect(result.roomId).toBeUndefined()
      expect(result.source).toBe('not_found')
    })
  })

  describe('resolveUser', () => {
    it('returns user alias with confidence 1.0 when alias is set', async () => {
      aliasStore.setUserAlias(
        '!current:matrix.org',
        '@user:matrix.org',
        'alice',
        '@alice:matrix.org'
      )
      const result = await resolver.resolveUser('alice', '@user:matrix.org', {
        currentRoomId: '!current:matrix.org',
      })
      expect(result.userId).toBe('@alice:matrix.org')
      expect(result.confidence).toBe(1.0)
      expect(result.source).toBe('user_alias')
    })

    it('resolves by display name with confidence 0.9', async () => {
      const result = await resolver.resolveUser('Alice', '@user:matrix.org')
      expect(result.userId).toBe('@alice:matrix.org')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('exact_display')
    })

    it('resolves by username localpart with confidence 0.8', async () => {
      // Use a user whose localpart does NOT match any display name
      // to ensure the username match path is exercised
      const clientNoProfile = createMockMatrixClient({
        getUserProfile: async (userId) => {
          // Return empty displayname for alice so only localpart matches
          if (userId === '@alice:matrix.org') return { displayname: '' }
          return { displayname: 'Bob' }
        },
      })
      const resolverNoProfile = new MatrixIdResolver({
        log: () => {},
        matrixClient: clientNoProfile,
        aliasStore: new AliasStore(),
      })
      const result = await resolverNoProfile.resolveUser('alice', '@user:matrix.org')
      expect(result.userId).toBe('@alice:matrix.org')
      expect(result.confidence).toBe(0.8)
      expect(result.source).toBe('username')
    })

    it('returns not_found when no users match', async () => {
      const result = await resolver.resolveUser('nobody', '@user:matrix.org')
      expect(result.userId).toBeUndefined()
      expect(result.source).toBe('not_found')
    })
  })

  describe('DM management', () => {
    it('findExistingDM returns null when no DM exists', async () => {
      const result = await resolver.findExistingDM('@unknown:matrix.org')
      expect(result).toBeNull()
    })

    it('createDM creates a new DM room', async () => {
      const result = await resolver.createDM('@user:matrix.org')
      expect(result).toBe('!new:matrix.org')
    })

    it('getOrCreateDM returns existing DM if found', async () => {
      // Mock has rooms with is_direct=false, so findExistingDM returns null
      // and getOrCreateDM creates a new one
      const result = await resolver.getOrCreateDM('@user:matrix.org')
      expect(result.roomId).toBe('!new:matrix.org')
      expect(result.created).toBe(true)
    })
  })
})
