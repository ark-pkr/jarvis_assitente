import path from 'node:path'
import { rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
export const dataDirectory = process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.jarvis-data', import.meta.url))
export const dataPath = (...parts) => path.join(dataDirectory, ...parts)

/**
 * Replaces a file with a finished temporary copy.
 *
 * On Windows this fails for a moment whenever something has the target open, and
 * the antivirus and the indexer open everything that was just written. Nothing
 * is wrong with the write, so it waits rather than losing the save.
 */
export async function replaceFile(temporary, target, { move = rename, attempts = 8, delayMs = 40 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await move(temporary, target) }
    catch (error) {
      if (attempt >= attempts || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
    }
  }
}
