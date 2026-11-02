import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GEMINI_TTS_VOICES, amplified, handleSpeechStream, pcmToWav, selectGeminiVoice, speechStatus } from './speech.mjs'
import { VoiceCache } from './voice-cache.mjs'

test('Gemini speech offers its supported voices and safely defaults unknown names', () => {
  assert.deepEqual(GEMINI_TTS_VOICES, ['Charon', 'Orus', 'Kore', 'Puck'])
  assert.equal(selectGeminiVoice('Orus'), 'Orus')
  assert.equal(selectGeminiVoice('not-a-voice'), 'Charon')
})

test('PCM becomes WAV and normalizes quiet audio without clipping', () => {
  const pcm = Buffer.alloc(8)
  ;[1000, -1000, 2000, -2000].forEach((sample, i) => pcm.writeInt16LE(sample, i * 2))
  const wav = pcmToWav(pcm)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.readUInt32LE(40), 8)
  assert.equal(wav.readInt16LE(44), 2000)
  assert.equal(wav.readInt16LE(46), -2000)
  assert.equal(pcm.readInt16LE(0), 1000)
  const loud = Buffer.alloc(4)
  loud.writeInt16LE(32767, 0); loud.writeInt16LE(-32768, 2)
  const out = pcmToWav(loud)
  assert.ok(Math.abs(out.readInt16LE(44)) <= 28000)
  assert.ok(Math.abs(out.readInt16LE(46)) <= 28000)
  assert.throws(() => pcmToWav(Buffer.alloc(1)))
})

const responseStub = () => {
  const written = []
  return { written, status: 0, writableEnded: false, destroyed: false, on() {},
    writeHead(status) { this.status = status }, write(chunk) { written.push(Buffer.from(chunk)) }, end(body) { if (body) written.push(Buffer.from(body)); this.writableEnded = true }, destroy() { this.destroyed = true } }
}
const audioChunk = (bytes) => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/l16; rate=24000; channels=1', data: Buffer.from(bytes).toString('base64') } }] } }] })
const streaming = (...chunks) => ({ models: { generateContentStream: async () => (async function* () { yield* chunks })() } })

test('the voice streams as a playable WAV of unknown length', async () => {
  const res = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Oi&voice=Charon' }, res, {}, streaming(audioChunk([0, 16]), audioChunk([0, 8])))
  assert.equal(res.status, 200)
  const [header, ...pcm] = res.written
  assert.equal(header.toString('ascii', 0, 4), 'RIFF')
  assert.equal(header.readUInt32LE(24), 24000)
  assert.equal(header.readUInt32LE(40), 0xffffffff - 36)
  assert.equal(Buffer.concat(pcm).length, 4)
  assert.equal(res.writableEnded, true)
})

test('a chunk that splits a sample does not shift the rest of the audio', async () => {
  const res = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, streaming(audioChunk([0, 16, 0]), audioChunk([16])))
  assert.equal(Buffer.concat(res.written.slice(1)).length, 4)
  assert.equal(Buffer.concat(res.written.slice(1)).readInt16LE(2), Buffer.concat(res.written.slice(1)).readInt16LE(0))
})

test('loud audio clips instead of wrapping around', () => {
  const pcm = Buffer.alloc(4); pcm.writeInt16LE(30000, 0); pcm.writeInt16LE(-30000, 2)
  const out = amplified(pcm)
  assert.equal(out.readInt16LE(0), 32767)
  assert.equal(out.readInt16LE(2), -32768)
})

test('a spent daily quota moves to the spare model instead of losing the voice', async () => {
  const res = responseStub()
  const asked = []
  const good = streaming(audioChunk([0, 16]))
  const ai = { models: { generateContentStream: async (request) => {
    asked.push(request.model)
    if (asked.length === 1) throw Object.assign(new Error('x'), { status: 429 })
    return good.models.generateContentStream(request)
  } } }
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, ai)
  assert.equal(res.status, 200)
  assert.equal(asked.length, 2)
  assert.notEqual(asked[0], asked[1])
})

test('any other failure does not spend a second model', async () => {
  const res = responseStub()
  let calls = 0
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, { models: { generateContentStream: async () => { calls++; throw Object.assign(new Error('x'), { status: 500 }) } } })
  assert.equal(calls, 1)
  assert.equal(res.status, 502)
})

const memoryCache = () => {
  const files = new Map()
  return new class extends VoiceCache {
    async find(keys) { for (const key of keys) if (files.has(key)) return files.get(key); return null }
    async put(key, audio) { files.set(key, audio) }
  }('')
}
const settled = () => new Promise((resolve) => setImmediate(resolve))

test('a short sentence said once costs nothing the second time, and sounds the same', async () => {
  const cache = memoryCache()
  let calls = 0
  const ai = { models: { generateContentStream: async (request) => { calls++; return streaming(audioChunk([0, 16]), audioChunk([0, 8])).models.generateContentStream(request) } } }
  const first = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Pronto.&voice=Charon' }, first, {}, ai, { cache })
  await settled()
  const again = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Pronto.&voice=Charon' }, again, {}, ai, { cache })
  assert.equal(calls, 1)
  assert.equal(again.status, 200)
  assert.deepEqual(Buffer.concat(again.written), Buffer.concat(first.written))
})

test('another voice, another tone or a long sentence is not the same audio', async () => {
  const cache = memoryCache()
  let calls = 0
  const ai = { models: { generateContentStream: async (request) => { calls++; return streaming(audioChunk([0, 16])).models.generateContentStream(request) } } }
  const long = encodeURIComponent('uma frase '.repeat(12))
  for (const url of ['text=Oi&voice=Charon', 'text=Oi&voice=Kore', 'text=Oi&voice=Charon&tone=animado', `text=${long}`, `text=${long}`]) {
    await handleSpeechStream({ url: `/voice/stream?${url}` }, responseStub(), {}, ai, { cache })
    await settled()
  }
  assert.equal(calls, 5)
})

test('a sentence cut short is never kept', async () => {
  const cache = memoryCache()
  const res = responseStub()
  const ai = { models: { generateContentStream: async () => (async function* () { yield audioChunk([0, 16]); throw new Error('caiu') })() } }
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, ai, { cache })
  await settled()
  assert.equal(res.destroyed, true)
  assert.equal(await cache.find([cache.key('gemini-3.1-flash-tts-preview', 'Charon', '', 'Oi')]), null)
})

test('a voice that does not start in time gives way to the system voice', async () => {
  const res = responseStub()
  const hung = { models: { generateContentStream: ({ config }) => new Promise((_, reject) => { config.abortSignal.addEventListener('abort', () => reject(new Error('cancelado'))) }) } }
  const began = Date.now()
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, hung, { firstAudioMs: 40 })
  assert.equal(res.status, 502)
  assert.ok(Date.now() - began < 1000)
})

test('the prune removes what has gone longest without being said', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-voice-'))
  const cache = new VoiceCache(folder)
  for (const [index, key] of ['velha', 'media', 'nova'].entries()) {
    await cache.put(key, Buffer.from(key))
    const when = new Date(Date.UTC(2026, 0, index + 1))
    await fs.utimes(cache.place(key), when, when)
  }
  await cache.prune(2)
  assert.deepEqual((await fs.readdir(folder)).sort(), ['media.wav', 'nova.wav'])
})

test('a failure before the first audio is an error the speaker can fall back from', async () => {
  const empty = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, empty, {}, streaming())
  assert.equal(empty.status, 502)
  const invalid = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=' }, invalid, {}, streaming())
  assert.equal(invalid.status, 400)
  const res = responseStub()
  const failing = { models: { generateContentStream: async () => { throw Object.assign(new Error('x'), { status: 429 }) } } }
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, failing)
  assert.equal(res.status, 429)
})

test('both quotas spent answers at once, without asking anyone', async (context) => {
  // Last in this file on purpose: the spent state lasts half an hour, and it should.
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  context.mock.timers.tick(31 * 60000)
  let calls = 0
  const spent = { models: { generateContentStream: async () => { calls++; throw Object.assign(new Error('x'), { status: 429 }) } } }
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, responseStub(), {}, spent)
  const asked = calls
  assert.ok(asked >= 1)
  const res = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, spent)
  assert.equal(res.status, 429)
  assert.equal(calls, asked)
  assert.equal(speechStatus().spareSpent, true)
  context.mock.timers.tick(31 * 60000)
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, responseStub(), {}, spent)
  assert.ok(calls > asked, 'depois de meia hora vale tentar de novo')
})
