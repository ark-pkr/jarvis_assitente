import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { createLocalVoice, handleLocalVoice, piperPaths } from './piper.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const serving = (files) => async (url) => {
  const body = files[url]
  if (body === undefined) return new Response('não', { status: 404 })
  return new Response(body, { headers: { 'content-length': String(Buffer.byteLength(body)) } })
}
const sources = { program: { url: 'p', sha256: sha('programa') }, voice: { url: 'v', sha256: sha('voz') } }
/** Unpacking the program leaves a piper.exe where the real archive would. */
const extract = async (archive, into) => { await fs.mkdir(path.join(into, 'piper'), { recursive: true }); await fs.writeFile(path.join(into, 'piper', 'piper.exe'), 'exe') }
const tempRoot = () => mkdtempSync(path.join(os.tmpdir(), 'jarvis-piper-'))

test('a download that is not the tested file is thrown away and nothing runs', async () => {
  const root = tempRoot()
  const voice = createLocalVoice({ root, sources, extract, fetch: serving({ p: 'outro programa', v: 'voz' }) })
  const done = await voice.install()
  assert.equal(done.state, 'erro')
  assert.match(done.error, /não é o esperado/)
  assert.equal(existsSync(piperPaths(root).program), false)
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.endsWith('.part')), [], 'no half file left behind')
})

test('the right files install once, with the voice settings beside them', async () => {
  const root = tempRoot()
  let asked = 0
  const get = serving({ p: 'programa', v: 'voz' })
  const voice = createLocalVoice({ root, sources, extract, fetch: (url) => { asked++; return get(url) } })
  assert.equal(voice.status().state, 'ausente')
  const [first, second] = await Promise.all([voice.install(), voice.install()])
  assert.equal(first.state, 'pronto')
  assert.equal(second.state, 'pronto')
  assert.equal(asked, 2, 'two files, asked for once even when install is called twice')
  const paths = piperPaths(root)
  assert.equal(await fs.readFile(paths.model, 'utf8'), 'voz')
  assert.match(await fs.readFile(paths.config, 'utf8'), /phoneme_id_map/)
  assert.equal(createLocalVoice({ root }).status().state, 'pronto', 'found again on the next start')
})

/** A Piper that writes each sentence it is sent and prints the file, as the real one does. */
function fakePiper({ hangOn = null } = {}) {
  const started = []
  const spawn = () => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => child.emit('exit', 1)
    started.push(child)
    let buffer = ''
    child.stdin.on('data', async (data) => {
      buffer += String(data)
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const { text, output_file: file } = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        if (text === hangOn) continue
        await fs.writeFile(file, `WAV:${text}`)
        child.stdout.write(`${file}\n`)
      }
    })
    return child
  }
  return { spawn, started }
}

async function readyVoice(piper) {
  const root = tempRoot()
  await createLocalVoice({ root, sources, extract, fetch: serving({ p: 'programa', v: 'voz' }) }).install()
  return createLocalVoice({ root, spawn: piper.spawn })
}

test('sentences come back in order from one running Piper, and leave no files', async () => {
  const piper = fakePiper()
  const voice = await readyVoice(piper)
  const said = await Promise.all(['Pronto.', 'São nove e vinte.', 'Lembrete criado.'].map((text) => voice.speak(text)))
  assert.deepEqual(said.map(String), ['WAV:Pronto.', 'WAV:São nove e vinte.', 'WAV:Lembrete criado.'])
  assert.equal(piper.started.length, 1, 'started once, not per sentence')
})

test('if Piper closes, the waiting sentence fails and the next one starts it again', async () => {
  const piper = fakePiper({ hangOn: 'trava' })
  const voice = await readyVoice(piper)
  const stuck = voice.speak('trava')
  await new Promise((resolve) => setTimeout(resolve, 20))
  piper.started[0].emit('exit', 1)
  await assert.rejects(stuck, /fechou/)
  assert.equal(String(await voice.speak('De volta.')), 'WAV:De volta.')
  assert.equal(piper.started.length, 2)
})

test('not installed: the route says so instead of hanging', async () => {
  const voice = createLocalVoice({ root: tempRoot() })
  const res = { code: 0, body: '', writeHead(code) { this.code = code }, end(body) { this.body = String(body ?? '') } }
  await handleLocalVoice({ url: '/voice/local?text=Oi', method: 'GET' }, res, {}, voice)
  assert.equal(res.code, 503)
  assert.match(res.body, /não instalada/)
  const empty = { ...res, code: 0 }
  await handleLocalVoice({ url: '/voice/local?text=', method: 'GET' }, empty, {}, voice)
  assert.equal(empty.code, 400)
})
