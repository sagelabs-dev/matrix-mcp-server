/**
 * persist.js — Simple JSON file persistence utility.
 *
 * Provides loadJson and saveJson for reading and writing plain JSON files.
 * Missing files and corrupt JSON return null (graceful degradation).
 *
 * @module persist
 */

import { promises as fs } from 'fs'
import path from 'path'

/**
 * Load and parse a JSON file.
 *
 * @param {string} filePath - Absolute or relative path to the JSON file.
 * @returns {Promise<Object|null>} Parsed JSON object, or null if the file
 *   does not exist or contains invalid JSON.
 */
export async function loadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Serialize an object to a JSON file, creating parent directories as needed.
 *
 * @param {string} filePath - Absolute or relative path to the JSON file.
 * @param {Object} data - The object to serialize.
 * @returns {Promise<void>}
 */
export async function saveJson(filePath, data) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
