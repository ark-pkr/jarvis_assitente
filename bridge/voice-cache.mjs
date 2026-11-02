import { promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { dataPath, replaceFile } from './paths.mjs'

/** Short sentences are the ones that come back: "Pronto.", "Boa tarde." A long one almost never does. */
const MAX_CHARS = 90
const MAX_FILES = 400
const PRUNE_EVERY = 20

export const worthKeeping = (text) => text.length <= MAX_CHARS

/**
 * Spoken sentences already paid for.
 *
 * Every sentence costs one of a hundred requests a day, so saying the same short
 * thing twice should cost nothing. It also means these still work with the quota
 * spent or the network down.
 */
export class VoiceCache {
  constructor(folder = dataPath('voice-cache')) { this.folder = folder; this.writes = 0 }
  key(model, voice, tone, text) { return createHash('sha256').update(JSON.stringify([model, voice, tone, text])).digest('hex') }
  place(key) { return path.join(this.folder, `${key}.wav`) }
  /** The first of these that exists, in order of preference. */
  async find(keys) {
    for (const key of keys) {
      try {
        const audio = await fs.readFile(this.place(key))
        const now = new Date()
        void fs.utimes(this.place(key), now, now).catch(() => {})
        return audio
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return null
  }
  async put(key, audio) {
    await fs.mkdir(this.folder, { recursive: true })
    const temp = path.join(this.folder, `${randomUUID()}.tmp`)
    await fs.writeFile(temp, audio, { flag: 'wx' })
    await replaceFile(temp, this.place(key))
    if (++this.writes % PRUNE_EVERY === 0) await this.prune()
  }
  /** Whatever has gone longest without being said goes first. */
  async prune(limit = MAX_FILES) {
    const names = (await fs.readdir(this.folder)).filter((name) => name.endsWith('.wav'))
    if (names.length <= limit) return
    const dated = await Promise.all(names.map(async (name) => ({ name, used: (await fs.stat(path.join(this.folder, name))).mtimeMs })))
    dated.sort((a, b) => a.used - b.used)
    await Promise.all(dated.slice(0, names.length - limit).map(({ name }) => fs.rm(path.join(this.folder, name), { force: true })))
  }
}

export const voiceCache = new VoiceCache()
