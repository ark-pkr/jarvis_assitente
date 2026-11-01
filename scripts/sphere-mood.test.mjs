import test from 'node:test'
import assert from 'node:assert/strict'
import { MOODS, easeMood, neighbours, parseColour, stepSignals } from '../src/scene/sphereMood.ts'

test('every phase looks different from the one before it in the conversation', () => {
  const order = ['dormant', 'listening', 'thinking', 'tooling', 'speaking']
  for (const [index, phase] of order.slice(1).entries()) {
    assert.notDeepEqual(MOODS[phase], MOODS[order[index]], phase)
  }
  assert.ok(MOODS.listening.size < MOODS.dormant.size, 'listening draws in')
  assert.ok(MOODS.thinking.signals > 0, 'thinking runs signals')
  assert.ok(MOODS.speaking.ripple > 0, 'speaking sends out waves')
  assert.ok(MOODS.tooling.sweep > 0, 'a tool sweeps the orbits')
})

test('a mood eases towards its target and never overshoots', () => {
  let mood = MOODS.dormant
  for (let frame = 0; frame < 120; frame++) {
    mood = easeMood(mood, MOODS.thinking, 1 / 30)
    assert.ok(mood.tint <= MOODS.thinking.tint + 1e-9)
  }
  assert.ok(Math.abs(mood.tint - MOODS.thinking.tint) < .01)
})

test('a large step does not jump past the target either', () => {
  assert.ok(easeMood(MOODS.dormant, MOODS.speaking, 100).ripple <= MOODS.speaking.ripple)
})

test('colours the model asks for are honoured and anything else stays gold', () => {
  assert.deepEqual(parseColour('#2080ff'), [32, 128, 255])
  assert.deepEqual(parseColour('#fff'), [255, 255, 255])
  assert.equal(parseColour('azul'), null)
  assert.equal(parseColour('rgb(1, 2, 3)'), null)
  assert.equal(parseColour(null), null)
})

test('signals keep moving, match the wanted count, and do not turn straight back', () => {
  const near = neighbours(4, [[0, 1], [1, 2], [2, 3], [3, 0]])
  let signals = stepSignals([], near, 3, 0)
  assert.equal(signals.length, 3)
  for (let frame = 0; frame < 200; frame++) {
    const next = stepSignals(signals, near, 3, 1 / 30)
    for (const signal of next) assert.notEqual(signal.to, signal.previous)
    signals = next
  }
  assert.equal(stepSignals(signals, near, 0, 1 / 30).length, 0)
})
