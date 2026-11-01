import test from 'node:test'
import assert from 'node:assert/strict'
import { createStretcher } from '../src/lib/timeStretch.ts'

const RATE = 24000
const tone = (hertz, seconds) => Float32Array.from({ length: RATE * seconds }, (_, i) => .5 * Math.sin(2 * Math.PI * hertz * i / RATE))
const crossings = (samples) => { let n = 0; for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) n++; return n }
const stretch = (samples, rate, block) => {
  const s = createStretcher(rate, RATE)
  const parts = []
  for (let at = 0; at < samples.length; at += block) parts.push(s.push(samples.subarray(at, at + block)))
  parts.push(s.flush())
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}

test('1.25× shortens the audio by that much', () => {
  const out = stretch(tone(180, 4), 1.25, 2048)
  assert.ok(Math.abs(out.length / RATE - 4 / 1.25) < .06, `${out.length / RATE} s`)
})

test('the pitch stays where it was, which is the whole point', () => {
  for (const rate of [.8, 1.25, 1.5, 1.8]) {
    const out = stretch(tone(180, 4), rate, 2048)
    const hertz = crossings(out) / (out.length / RATE)
    assert.ok(Math.abs(hertz - 180) < 4, `${rate}×: ${hertz} Hz`)
  }
})

test('the volume does not pump or collapse', () => {
  const out = stretch(tone(180, 2), 1.25, 2048).subarray(2400, -2400)
  const rms = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0) / out.length)
  assert.ok(Math.abs(rms - .5 / Math.SQRT2) < .03, String(rms))
})

test('the size of the arriving blocks does not change the result', () => {
  const samples = tone(220, 2)
  const whole = stretch(samples, 1.25, samples.length)
  const pieces = stretch(samples, 1.25, 317)
  assert.equal(pieces.length, whole.length)
  for (let i = 0; i < whole.length; i += 97) assert.ok(Math.abs(pieces[i] - whole[i]) < 1e-5, String(i))
})

test('at normal speed the audio passes through untouched', () => {
  const samples = tone(220, 1)
  assert.equal(createStretcher(1, RATE).push(samples), samples)
})

test('a long answer does not keep growing in memory', () => {
  const s = createStretcher(1.25, RATE)
  let produced = 0
  for (let block = 0; block < 2000; block++) produced += s.push(new Float32Array(2048).fill(.1)).length
  assert.ok(produced > 2000 * 2048 / 1.25 * .98)
})
