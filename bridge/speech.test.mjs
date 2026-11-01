import test from 'node:test'
import assert from 'node:assert/strict'
import { GEMINI_TTS_VOICES, pcmToWav, selectGeminiVoice } from './speech.mjs'

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
