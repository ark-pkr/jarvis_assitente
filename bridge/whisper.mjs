import { execFile as execFileProcess } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dataPath } from './paths.mjs'
import { download, unzip } from './piper.mjs'

/**
 * The watcher: Whisper, on this computer, listening to everything the
 * microphone catches for one thing only, whether somebody called "Jarvis".
 *
 * Nothing it hears leaves the machine. Only a sentence that called him by name
 * goes on to Gemini, which transcribes it properly; a conversation at the
 * counter is heard here and dropped here. Whisper's small model gets the name
 * right with a hint, but not every other word, which is why it only watches.
 *
 * whisper-cli runs once per sentence. Loading the model takes about 0.15 s and
 * a short sentence about a second on a laptop processor, so nothing needs to
 * stay running between sentences.
 */

const PROGRAM = {
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
  sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
}
const MODEL = {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
}
/**
 * Without a hint the name comes out as "E aravis" or "Geravis", and the name is
 * the whole job. With it, Whisper hears "Jarvis".
 */
const HINT = 'Jarvis, assistente pessoal. Jarvis, que horas são?'
/** A sentence taking longer than this is not worth waiting for: Gemini hears it instead. */
const SENTENCE_MS = 10000
/** Longer than any request; past this it is a conversation, and only its ends could hold the name. */
const MAX_BYTES = 16000 * 2 * 30 + 44

export function whisperPaths(root = dataPath('whisper')) {
  return {
    root,
    program: path.join(root, 'Release', 'whisper-cli.exe'),
    model: path.join(root, 'ggml-base.bin'),
    work: path.join(root, 'work'),
  }
}

const installed = (paths) => existsSync(paths.program) && existsSync(paths.model)
/** Leaves the computer some room for everything else it is doing. */
const threads = () => Math.max(2, Math.min(8, os.cpus().length - 2))
/** whisper-cli prints the words alone with -nt; the rest of what it says is on stderr. */
export const cleanTranscript = (stdout) => stdout.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean).join(' ').trim()

export function createLocalWatcher({ root, fetch: get = fetch, execFile = execFileProcess, extract = unzip, sources = { program: PROGRAM, model: MODEL } } = {}) {
  const paths = whisperPaths(root)
  let state = installed(paths) ? 'pronto' : 'ausente'
  let progress = 0
  let failure = ''
  let installing = null
  let chain = Promise.resolve()
  let counter = 0

  const status = () => ({ state, progress: Math.round(progress * 100), error: failure })

  function install() {
    if (state === 'pronto') return Promise.resolve(status())
    installing ??= (async () => {
      state = 'baixando'
      failure = ''
      try {
        await fs.mkdir(paths.root, { recursive: true })
        if (!existsSync(paths.program)) {
          const archive = path.join(paths.root, 'whisper.zip')
          await download(sources.program, archive, { fetch: get, onProgress: (part) => { progress = part * .06 } })
          await extract(archive, paths.root)
          await fs.rm(archive, { force: true })
        }
        if (!existsSync(paths.model)) await download(sources.model, paths.model, { fetch: get, onProgress: (part) => { progress = .06 + part * .94 } })
        if (!installed(paths)) throw new Error('a instalação ficou incompleta')
        state = 'pronto'
        progress = 1
        console.log('[jarvis] vigia local: instalado')
      } catch (error) {
        state = 'erro'
        failure = error.message
        console.warn('[jarvis] vigia local: não foi possível instalar:', error.message)
      } finally {
        installing = null
      }
      return status()
    })()
    return installing
  }

  /** What was said in one 16 kHz WAV, as Whisper heard it. One sentence at a time. */
  function hear(wav) {
    const run = chain.then(async () => {
      if (state !== 'pronto') throw new Error('vigia local não instalado')
      if (wav.length > MAX_BYTES) throw new Error('trecho longo demais para o vigia')
      await fs.mkdir(paths.work, { recursive: true })
      const file = path.join(paths.work, `trecho-${process.pid}-${++counter}.wav`)
      await fs.writeFile(file, wav)
      try {
        const stdout = await new Promise((resolve, reject) => {
          execFile(paths.program, ['-m', paths.model, '-f', file, '-l', 'pt', '-nt', '-np', '-t', String(threads()), '--prompt', HINT],
            { windowsHide: true, timeout: SENTENCE_MS, maxBuffer: 1 << 20 },
            (error, out) => error ? reject(error) : resolve(String(out)))
        })
        return cleanTranscript(stdout)
      } finally {
        await fs.rm(file, { force: true })
      }
    })
    chain = run.catch(() => {})
    return run
  }

  return { status, install, hear }
}

export const isWatchRequest = (req) => req.url === '/stt/watch' || req.url === '/stt/watch/status' || req.url === '/stt/watch/install'

/** POST /stt/watch with a WAV gives { text }; /status and POST /install as for the local voice. */
export async function handleWatch(req, res, cors, watcher) {
  const json = (code, body) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url === '/stt/watch/status') return json(200, watcher.status())
  if (req.method !== 'POST') return json(405, { error: 'use POST' })
  if (req.url === '/stt/watch/install') {
    void watcher.install()
    return json(202, watcher.status())
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BYTES) return json(413, { error: 'trecho longo demais para o vigia' })
    chunks.push(chunk)
  }
  const wav = Buffer.concat(chunks)
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return json(400, { error: 'esperava um WAV' })
  try {
    json(200, { text: await watcher.hear(wav) })
  } catch (error) {
    json(503, { ...watcher.status(), error: error.message })
  }
}
