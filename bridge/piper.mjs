import { spawn as spawnProcess, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dataPath } from './paths.mjs'
import { FABER_CONFIG } from './voices/faber.mjs'

/**
 * His voice, made on this computer by Piper: no model call, no quota, and it
 * works without the internet. The program and the voice are downloaded once, on
 * first use, and each file is checked against the exact one that was tested
 * before anything runs.
 *
 * Piper stays running with the voice loaded, so a sentence takes about a tenth
 * of a second instead of the second it takes to start the program each time.
 */

export const LOCAL_VOICE = 'pt_BR-faber-medium'
const PROGRAM = {
  url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea',
}
const VOICE = {
  url: `https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/${LOCAL_VOICE}.onnx`,
  sha256: '75e913eb463db0b6ac7ddf68d3e4c9ac19ace36dc3b710a81039b448352b8ffc',
}
/**
 * The voice's settings, kept here rather than downloaded: the published file now
 * lists a few sounds as two characters each, which this Piper rejects. Only those
 * five were removed; the voice itself is untouched.
 */
// A module rather than a .json beside it: the installed app packs this folder into one archive.
/** A sentence that takes longer than this has gone wrong; the system voice says it instead. */
const SENTENCE_MS = 8000

export const sha256File = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

/** Where everything lives, and whether it is all there. */
export function piperPaths(root = dataPath('piper')) {
  const program = path.join(root, 'piper', 'piper.exe')
  return {
    root, program,
    espeak: path.join(root, 'piper', 'espeak-ng-data'),
    model: path.join(root, `${LOCAL_VOICE}.onnx`),
    config: path.join(root, `${LOCAL_VOICE}.onnx.json`),
    output: path.join(root, 'out'),
  }
}

const installed = (paths) => [paths.program, paths.model, paths.config].every((file) => existsSync(file))

/** Downloads to a temporary name and keeps it only if it is exactly the tested file. */
export async function download(source, target, { fetch: get = fetch, onProgress = () => {} } = {}) {
  const partial = `${target}.part`
  const response = await get(source.url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`download falhou (HTTP ${response.status})`)
  const total = Number(response.headers.get('content-length')) || 0
  let received = 0
  const counted = Readable.fromWeb(response.body).on('data', (chunk) => { received += chunk.length; if (total) onProgress(received / total) })
  await pipeline(counted, createWriteStream(partial))
  const sum = await sha256File(partial)
  if (sum !== source.sha256) {
    await fs.rm(partial, { force: true })
    throw new Error('o arquivo baixado não é o esperado; nada foi instalado')
  }
  await fs.rename(partial, target)
}

/**
 * Windows 10 and 11 ship bsdtar, which reads zip files. Named by its full path:
 * a plain "tar" can find Git's, which reads no zip and takes "C:" for a host.
 */
const WINDOWS_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
export const unzip = (file, into) => new Promise((resolve, reject) => {
  execFile(WINDOWS_TAR, ['-xf', file, '-C', into], { windowsHide: true }, (error) => error ? reject(error) : resolve())
})

/**
 * The local voice: install(), then speak(text) for a WAV. One sentence at a time,
 * in order, through the one running Piper.
 */
export function createLocalVoice({ root, fetch: get = fetch, spawn = spawnProcess, extract = unzip, sources = { program: PROGRAM, voice: VOICE } } = {}) {
  const paths = piperPaths(root)
  let state = installed(paths) ? 'pronto' : 'ausente'
  let progress = 0
  let failure = ''
  let installing = null
  let child = null
  let lines = ''
  const waiting = []
  let chain = Promise.resolve()
  let counter = 0

  const status = () => ({ state, progress: Math.round(progress * 100), error: failure, voice: LOCAL_VOICE })

  function install() {
    if (state === 'pronto') return Promise.resolve(status())
    installing ??= (async () => {
      state = 'baixando'
      failure = ''
      try {
        await fs.mkdir(paths.root, { recursive: true })
        if (!existsSync(paths.program)) {
          const archive = path.join(paths.root, 'piper.zip')
          await download(sources.program, archive, { fetch: get, onProgress: (part) => { progress = part * .25 } })
          await extract(archive, paths.root)
          await fs.rm(archive, { force: true })
        }
        if (!existsSync(paths.model)) await download(sources.voice, paths.model, { fetch: get, onProgress: (part) => { progress = .25 + part * .75 } })
        await fs.writeFile(paths.config, JSON.stringify(FABER_CONFIG))
        if (!installed(paths)) throw new Error('a instalação ficou incompleta')
        state = 'pronto'
        progress = 1
        warm()
        console.log('[jarvis] voz local: instalada')
      } catch (error) {
        state = 'erro'
        failure = error.message
        console.warn('[jarvis] voz local: não foi possível instalar:', error.message)
      } finally {
        installing = null
      }
      return status()
    })()
    return installing
  }

  function start() {
    if (child) return child
    child = spawn(paths.program, ['--model', paths.model, '--config', paths.config, '--espeak_data', paths.espeak, '--json-input', '--output_dir', paths.output], { windowsHide: true })
    lines = ''
    child.stdout.on('data', (data) => {
      lines += String(data)
      let end
      while ((end = lines.indexOf('\n')) >= 0) {
        const line = lines.slice(0, end).trim()
        lines = lines.slice(end + 1)
        if (line) waiting.shift()?.resolve(line)
      }
    })
    child.stderr.on('data', (data) => { if (/\berror\b/i.test(String(data))) console.warn('[jarvis] voz local:', String(data).trim().slice(0, 200)) })
    const gone = () => {
      child = null
      for (const pending of waiting.splice(0)) pending.reject(new Error('a voz local fechou'))
    }
    child.on('exit', gone)
    child.on('error', gone)
    return child
  }

  /** One sentence as a WAV file's bytes. */
  function speak(text) {
    const run = chain.then(async () => {
      if (state !== 'pronto') throw new Error('voz local não instalada')
      await fs.mkdir(paths.output, { recursive: true })
      const file = path.join(paths.output, `frase-${process.pid}-${++counter}.wav`)
      const piper = start()
      const written = new Promise((resolve, reject) => waiting.push({ resolve, reject }))
      piper.stdin.write(`${JSON.stringify({ text: text.replace(/\s+/g, ' ').trim(), output_file: file })}\n`)
      let timer
      try {
        await Promise.race([written, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('a voz local demorou demais')), SENTENCE_MS) })])
      } catch (error) {
        // Whatever it was doing is now out of step with the queue: start it afresh.
        waiting.length = 0
        child?.kill()
        child = null
        throw error
      } finally {
        clearTimeout(timer)
      }
      try { return await fs.readFile(file) } finally { await fs.rm(file, { force: true }) }
    })
    chain = run.catch(() => {})
    return run
  }

  const stop = () => { child?.kill(); child = null }
  /** Loads the voice ahead of the first sentence, which otherwise waits over a second for it. */
  // Only a head start: if it cannot open now, the first sentence tries again and says why.
  function warm() {
    if (state !== 'pronto') return
    try { start() } catch (error) { console.warn('[jarvis] voz local: não abriu ainda:', error.message) }
  }

  return { status, install, speak, stop, warm }
}

export const isLocalVoiceRequest = (req) => req.url === '/voice/local/status' || req.url === '/voice/local/install' || req.url?.startsWith('/voice/local?')

/** GET /voice/local?text= gives a WAV; /status says where the install is; POST /install starts it. */
export async function handleLocalVoice(req, res, cors, voice) {
  const json = (code, body) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url === '/voice/local/status') { voice.warm?.(); return json(200, voice.status()) }
  if (req.url === '/voice/local/install') {
    if (req.method !== 'POST') return json(405, { error: 'use POST' })
    // Answered at once: the download takes a while, and the status says how it is going.
    void voice.install()
    return json(202, voice.status())
  }
  const text = new URL(req.url, 'http://local').searchParams.get('text')?.trim() ?? ''
  if (!text || text.length > 2000) return json(400, { error: 'texto vazio ou longo demais' })
  try {
    const wav = await voice.speak(text)
    res.writeHead(200, { ...cors, 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store' })
    res.end(wav)
  } catch (error) {
    json(503, { ...voice.status(), error: error.message })
  }
}
