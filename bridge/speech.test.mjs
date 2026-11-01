import test from 'node:test'
import assert from 'node:assert/strict'
import { GEMINI_TTS_VOICES, amplified, handleSpeechStream, pcmToWav, selectGeminiVoice } from './speech.mjs'

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

test('a failure before the first audio is an error the speaker can fall back from', async () => {
  const res = responseStub()
  const failing = { models: { generateContentStream: async () => { throw Object.assign(new Error('x'), { status: 429 }) } } }
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, res, {}, failing)
  assert.equal(res.status, 429)
  const empty = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=Oi' }, empty, {}, streaming())
  assert.equal(empty.status, 502)
  const invalid = responseStub()
  await handleSpeechStream({ url: '/voice/stream?text=' }, invalid, {}, streaming())
  assert.equal(invalid.status, 400)
})
