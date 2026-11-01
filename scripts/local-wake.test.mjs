import test from 'node:test'
import assert from 'node:assert/strict'
import { createFramer, segmentMaySend } from '../src/lib/localWake.ts'

test('capture blocks become fixed frames at the target rate, whatever their size', () => {
  const frames = []
  const feed = createFramer(512, 16000, (frame) => frames.push(frame))
  // 48 kHz in, 16 kHz out: three samples in for each one out.
  for (let block = 0; block < 10; block++) feed(new Float32Array(2048).fill(.5), 48000)
  assert.equal(frames.length, Math.floor(10 * 2048 / 3 / 512))
  assert.ok(frames.every((frame) => frame.length === 512))
  assert.ok(frames.flatMap((frame) => [...frame]).every((value) => value === Math.round(.5 * 32767) || value === Math.floor(.5 * 32767)))
})

test('a fractional rate does not drift across block boundaries', () => {
  let samples = 0
  const feed = createFramer(100, 16000, (frame) => { samples += frame.length })
  for (let block = 0; block < 441; block++) feed(new Float32Array(1000), 44100)
  // 441000 samples at 44.1 kHz is ten seconds, so 160000 at 16 kHz.
  assert.ok(Math.abs(samples - 160000) <= 100, String(samples))
})

test('out-of-range audio clips instead of wrapping around', () => {
  const frames = []
  const feed = createFramer(2, 16000, (frame) => frames.push(frame))
  feed(Float32Array.of(2, -2), 16000)
  assert.deepEqual([...frames[0]], [32767, -32768])
})

const state = { localWake: true, heldText: false, addressedAtStart: false, addressedUntil: 0, now: 1000 }

test('without his name, nothing leaves the machine', () => {
  assert.equal(segmentMaySend(state), false)
})

test('his name, a follow-up window, or a sentence in progress all let it through', () => {
  assert.equal(segmentMaySend({ ...state, addressedUntil: 2000 }), true)
  assert.equal(segmentMaySend({ ...state, addressedAtStart: true }), true, 'a long sentence outlives the window it began in')
  assert.equal(segmentMaySend({ ...state, heldText: true }), true)
})

test('with local detection off the behaviour stays as it was', () => {
  assert.equal(segmentMaySend({ ...state, localWake: false }), true)
})
