import path from 'node:path'
import { rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
export const dataDirectory = process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.jarvis-data', import.meta.url))
export const dataPath = (...parts) => path.join(dataDirectory, ...parts)

/**
 * The same file as it sits outside the app's archive.
 *
 * The installed app is packed into app.asar, which this process reads as if it
 * were a folder but nothing else can. A script handed to PowerShell has to be a
 * real file, so electron-builder keeps those in app.asar.unpacked (asarUnpack in
 * electron-builder.cjs) and this points there. Outside the package it changes
 * nothing.
 */
export const unpacked = (file) => file.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')

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
