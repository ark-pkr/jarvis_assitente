import test from 'node:test'
import assert from 'node:assert/strict'
import { daylight, dayShade } from '../src/scene/dayCycle.ts'

const at = (hour, minute = 0) => new Date(2026, 10, 6, hour, minute)

test('full day in the afternoon, full night in the small hours', () => {
  assert.equal(daylight(at(13)), 1)
  assert.equal(daylight(at(2)), 0)
  assert.equal(daylight(at(23, 30)), 0)
})

test('dawn and dusk ease across, never jumping', () => {
  let before = daylight(at(4, 50))
  for (let minute = 4 * 60 + 55; minute <= 23 * 60; minute += 5) {
    const now = daylight(at(Math.floor(minute / 60), minute % 60))
    assert.ok(Math.abs(now - before) < .06, `step at ${minute} min`)
    before = now
  }
  assert.ok(daylight(at(6, 30)) > 0 && daylight(at(6, 30)) < 1)
  assert.ok(daylight(at(20)) > 0 && daylight(at(20)) < 1)
})

test('night is calmer but never dark enough to hide him', () => {
  const night = dayShade(0), day = dayShade(1)
  assert.deepEqual(day, { glow: 1, spin: 1 })
  assert.ok(night.glow < day.glow && night.glow >= .7)
  assert.ok(night.spin < day.spin && night.spin >= .7)
})
