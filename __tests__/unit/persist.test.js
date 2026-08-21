import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadJson, saveJson } from '../../src/persist.js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('persist', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('saveJson', () => {
    it('saves a plain object to a JSON file', async () => {
      const filePath = path.join(tmpDir, 'data.json')
      await saveJson(filePath, { name: 'test', value: 42 })
      const raw = await fs.readFile(filePath, 'utf-8')
      expect(JSON.parse(raw)).toEqual({ name: 'test', value: 42 })
    })

    it('creates parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'nested', 'deep', 'data.json')
      await saveJson(filePath, { hello: 'world' })
      const raw = await fs.readFile(filePath, 'utf-8')
      expect(JSON.parse(raw)).toEqual({ hello: 'world' })
    })

    it('overwrites existing file', async () => {
      const filePath = path.join(tmpDir, 'data.json')
      await saveJson(filePath, { version: 1 })
      await saveJson(filePath, { version: 2 })
      const raw = await fs.readFile(filePath, 'utf-8')
      expect(JSON.parse(raw)).toEqual({ version: 2 })
    })
  })

  describe('loadJson', () => {
    it('loads a JSON file and returns parsed object', async () => {
      const filePath = path.join(tmpDir, 'data.json')
      await fs.writeFile(filePath, JSON.stringify({ key: 'value' }))
      const result = await loadJson(filePath)
      expect(result).toEqual({ key: 'value' })
    })

    it('returns null for missing file (graceful)', async () => {
      const result = await loadJson(path.join(tmpDir, 'nonexistent.json'))
      expect(result).toBeNull()
    })

    it('returns null for corrupt JSON (graceful)', async () => {
      const filePath = path.join(tmpDir, 'corrupt.json')
      await fs.writeFile(filePath, '{ not valid json')
      const result = await loadJson(filePath)
      expect(result).toBeNull()
    })
  })

  describe('round-trip', () => {
    it('save then load preserves data', async () => {
      const filePath = path.join(tmpDir, 'round-trip.json')
      const original = {
        rooms: { 'eng': '!abc:matrix.org' },
        users: { 'alice': '@alice:matrix.org' },
        nested: { deep: { value: true } },
      }
      await saveJson(filePath, original)
      const loaded = await loadJson(filePath)
      expect(loaded).toEqual(original)
    })
  })
})
