import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { cleanTranscript, createLocalWatcher, handleWatch, whisperPaths } from './whisper.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const serving = (files) => async (url) => files[url] === undefined ? new Response('não', { status: 404 }) : new Response(files[url])
const sources = { program: { url: 'p', sha256: sha('programa') }, model: { url: 'm', sha256: sha('modelo') } }
const extract = async (archive, into) => { await fs.mkdir(path.join(into, 'Release'), { recursive: true }); await fs.writeFile(path.join(into, 'Release', 'whisper-cli.exe'), 'exe') }
const tempRoot = () => mkdtempSync(path.join(os.tmpdir(), 'jarvis-whisper-'))
const wav = (bytes = 3200) => { const b = Buffer.alloc(44 + bytes); b.write('RIFF', 0); b.write('WAVE', 8); return b }

test('a model that is not the tested file is thrown away', async () => {
  const root = tempRoot()
  const watcher = createLocalWatcher({ root, sources, extract, fetch: serving({ p: 'programa', m: 'outro modelo' }) })
  const done = await watcher.install()
  assert.equal(done.state, 'erro')
  assert.equal(existsSync(whisperPaths(root).model), false)
})

test('installs once and is found again on the next start', async () => {
  const root = tempRoot()
  const watcher = createLocalWatcher({ root, sources, extract, fetch: serving({ p: 'programa', m: 'modelo' }) })
  const [a, b] = await Promise.all([watcher.install(), watcher.install()])
  assert.equal(a.state, 'pronto')
  assert.equal(b.state, 'pronto')
  assert.equal(createLocalWatcher({ root }).status().state, 'pronto')
})

test('each sentence runs Whisper in Portuguese with the name as a hint, one at a time', async () => {
  const root = tempRoot()
  await createLocalWatcher({ root, sources, extract, fetch: serving({ p: 'programa', m: 'modelo' }) }).install()
  const calls = []
  let running = 0
  const execFile = (program, args, options, done) => {
    running++
    assert.equal(running, 1, 'never two at once')
    calls.push(args)
    const file = args[args.indexOf('-f') + 1]
    assert.ok(existsSync(file), 'the sentence is on disk while Whisper reads it')
    setTimeout(() => { running--; done(null, `\r\n Jarvis, que horas são?\r\n\r\n`) }, 10)
  }
  const watcher = createLocalWatcher({ root, execFile })
  const heard = await Promise.all([watcher.hear(wav()), watcher.hear(wav())])
  assert.deepEqual(heard, ['Jarvis, que horas são?', 'Jarvis, que horas são?'])
  assert.equal(calls[0][calls[0].indexOf('-l') + 1], 'pt')
  assert.match(calls[0][calls[0].indexOf('--prompt') + 1], /Jarvis/)
  assert.deepEqual(await fs.readdir(whisperPaths(root).work), [], 'no sentence left on disk')
})

test('the route wants a WAV, refuses a long one, and says when it is not installed', async () => {
  const watcher = createLocalWatcher({ root: tempRoot() })
  const call = async (body, url = '/stt/watch', method = 'POST') => {
    const req = Readable.from([body])
    Object.assign(req, { url, method })
    const res = { code: 0, body: '', writeHead(code) { this.code = code }, end(text) { this.body = String(text ?? '') } }
    await handleWatch(req, res, {}, watcher)
    return res
  }
  assert.equal((await call(Buffer.from('não é áudio'))).code, 400)
  assert.equal((await call(wav(16000 * 2 * 31))).code, 413)
  const missing = await call(wav())
  assert.equal(missing.code, 503)
  assert.match(missing.body, /não instalado/)
})

test('only the words come back, whatever else Whisper printed around them', () => {
  assert.equal(cleanTranscript('\r\n  Jarvis, abre o Word.\r\n\r\n'), 'Jarvis, abre o Word.')
  assert.equal(cleanTranscript(''), '')
})
