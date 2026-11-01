import test from 'node:test'
import assert from 'node:assert/strict'
import { enrollUtterance, profileFromBase64, profileToBase64, scoreSpeaker, wavToPcm16 } from '../src/lib/speakerIdentity.ts'

function wave(samples, sampleRate = 16000) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVE', 8); bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, index) => bytes.writeInt16LE(sample, 44 + index * 2))
  return new Blob([bytes], { type: 'audio/wav' })
}

test('speaker enrollment converts little-endian WAV to the recognizer sample rate', async () => {
  const pcm = await wavToPcm16(wave([0, 1000, -1000, 2000]), 16000)
  assert.deepEqual([...pcm], [0, 1000, -1000, 2000])
  const resampled = await wavToPcm16(wave([0, 1000, 2000, 3000], 8000), 16000)
  assert.deepEqual([...resampled], [0, 500, 1000, 1500, 2000, 2500, 3000, 3000])
})

test('speaker profiles round-trip to the encrypted storage representation', () => {
  const profile = { bytes: Uint8Array.from([0, 1, 2, 127, 255]) }
  assert.deepEqual([...profileFromBase64(profileToBase64(profile)).bytes], [...profile.bytes])
})

test('enrollment sends complete frames and voice verification rejects low confidence', async () => {
  const frames = []
  const profiler = {
    frameLength: 4,
    enroll: async (frame) => { frames.push([...frame]); return frames.length * 10 },
  }
  assert.equal(await enrollUtterance(profiler, Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])), 20)
  assert.deepEqual(frames, [[1, 2, 3, 4], [5, 6, 7, 8]])

  const audio = wave([1, 2, 3, 4, 5, 6, 7, 8])
  const recognizer = {
    sampleRate: 16000,
    minProcessSamples: 4,
    process: async () => [0.8],
  }
  const profile = { bytes: new Uint8Array([1]) }
  assert.deepEqual(await scoreSpeaker(audio, recognizer, profile, 0.7), { accepted: true, score: 0.8 })
  assert.deepEqual(await scoreSpeaker(audio, recognizer, profile, 0.9), { accepted: false, score: 0.8 })
  assert.deepEqual(await scoreSpeaker(wave([1, 2, 3]), recognizer, profile, 0.5), { accepted: false, score: null })
})
