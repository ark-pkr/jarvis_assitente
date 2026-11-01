import test from 'node:test'
import assert from 'node:assert/strict'
import { SpeechGate } from '../src/lib/speechGate.ts'
const feed = (gate, energy, frames, pause = 1500) => Array.from({ length: frames }, () => gate.feed(energy, 50, pause)).filter(Boolean)
test('calibrates ambient noise without triggering stationary fan or short clicks', () => {
  const gate = new SpeechGate(); feed(gate, 0.015, 10)
  assert.ok(gate.calibrated)
  assert.deepEqual(feed(gate, 0.016, 60), [])
  assert.deepEqual(feed(gate, 0.1, 2), [])
  assert.deepEqual(feed(gate, 0.016, 20), [])
})
test('quiet speech is captured and a pause within a sentence does not end it', () => {
  const gate = new SpeechGate(); feed(gate, 0.0008, 10)
  assert.deepEqual(feed(gate, 0.006, 8), ['start'])
  assert.deepEqual(feed(gate, 0.0008, 20), [])
  assert.deepEqual(feed(gate, 0.006, 8), [])
  assert.deepEqual(feed(gate, 0.0008, 31), ['end'])
})
test('the faster endpoint waits 700ms of silence without cutting a short breath', () => {
  const gate = new SpeechGate(); feed(gate, 0.0008, 10)
  assert.deepEqual(feed(gate, 0.006, 8, 700), ['start'])
  assert.deepEqual(feed(gate, 0.0008, 10, 700), [])
  assert.deepEqual(feed(gate, 0.006, 2, 700), [])
  assert.deepEqual(feed(gate, 0.0008, 14, 700), ['end'])
})
test('short bumps are discarded and manual reset clears partial speech', () => {
  const gate = new SpeechGate(); feed(gate, 0.001, 10)
  assert.deepEqual(feed(gate, 0.02, 3), ['start'])
  assert.deepEqual(feed(gate, 0.001, 31), ['discard'])
  feed(gate, 0.02, 4); gate.reset(); assert.equal(gate.speaking, false)
})
