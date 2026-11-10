import test from 'node:test'
import assert from 'node:assert/strict'
import {
  askedShower, INTRO_DONE, INTRO_SECONDS, introAt, MERGER_SECONDS, mergerAt, meteorShower, NO_MERGER,
  nextMergerIn, parseBirthday, requestSpectacle, specialDay, takeSpectacles,
} from '../src/scene/cosmicEvents.ts'

const on = (month, day, hour = 12, minute = 0, second = 0) => new Date(2026, month - 1, day, hour, minute, second)

test('the opening flies in from far, lights the disc and lands exactly where the picture rests', () => {
  const first = introAt(0)
  assert.ok(first.distance > 6 && first.light === 0 && first.warp === 1)
  let before = first
  for (let s = .1; s < INTRO_SECONDS; s += .1) {
    const now = introAt(s)
    assert.ok(now.distance <= before.distance && now.light >= before.light, `moves one way at ${s.toFixed(1)} s`)
    before = now
  }
  assert.deepEqual(introAt(INTRO_SECONDS), INTRO_DONE)
  assert.deepEqual(INTRO_DONE, { distance: 1, pitch: 0, light: 1, warp: 0 })
})

test('the second hole spirals in faster and closer, then the merger flashes and sends waves out', () => {
  const radius = (frame) => Math.hypot(frame.x, frame.y, frame.z)
  assert.equal(mergerAt(0).size, 0, 'fades in rather than popping up')
  assert.ok(mergerAt(3).size > 0)
  assert.ok(radius(mergerAt(3)) > radius(mergerAt(12)) && radius(mergerAt(12)) > radius(mergerAt(17.9)))
  assert.ok(radius(mergerAt(17.99)) >= 1.1, 'never inside the big shadow')
  const after = mergerAt(18.2)
  assert.equal(after.size, 0)
  assert.ok(after.flash > .5 && after.wave > .5 && after.waveTime > 0)
  assert.ok(mergerAt(23).flash < after.flash)
  assert.deepEqual(mergerAt(MERGER_SECONDS), NO_MERGER)
  assert.deepEqual(mergerAt(-1), NO_MERGER)
})

test('mergers on their own are rare: two to four hours apart', () => {
  assert.equal(nextMergerIn(() => 0), 2 * 3600_000)
  assert.equal(nextMergerIn(() => .999999) < 4 * 3600_000 + 1, true)
})

test('special days: New Year, Christmas and the birthday typed in the settings', () => {
  assert.equal(specialDay(on(12, 31, 20)), 'ano-novo')
  assert.equal(specialDay(on(1, 1, 9)), 'ano-novo')
  assert.equal(specialDay(on(12, 31, 10)), null, 'not yet in the morning of the 31st')
  assert.equal(specialDay(on(12, 25, 15)), 'natal')
  assert.equal(specialDay(on(12, 24, 19)), 'natal')
  assert.equal(specialDay(on(8, 15), '15/08'), 'aniversario')
  assert.equal(specialDay(on(8, 15), ''), null)
  assert.equal(specialDay(on(3, 10)), null)
  assert.deepEqual(parseBirthday('5/8'), { day: 5, month: 8 })
  assert.equal(parseBirthday('31/02'), null)
  assert.equal(parseBirthday('29/02') !== null, true, 'a leap-day birthday still counts')
  assert.equal(parseBirthday('abc'), null)
})

test('on a special day a shower comes each quarter hour; on other days, never', () => {
  assert.ok(meteorShower(on(12, 25, 15, 30, 30)) > .9, 'in the middle of a shower')
  assert.equal(meteorShower(on(12, 25, 15, 32, 0)), 0, 'between showers')
  assert.ok(meteorShower(on(12, 25, 15, 30, 1)) < meteorShower(on(12, 25, 15, 30, 4)), 'eases in')
  assert.equal(meteorShower(on(12, 31, 23, 58)), 1, 'the turn of the year, without a break')
  assert.equal(meteorShower(on(1, 1, 0, 5)), 1)
  assert.equal(meteorShower(on(3, 10, 15, 30, 30)), 0)
})

test('a shower asked for by voice eases in, lasts, and ends', () => {
  assert.equal(askedShower(0), 0)
  assert.ok(askedShower(20) > .99)
  assert.equal(askedShower(40), 0)
})

test('a show asked for is taken once', () => {
  requestSpectacle('fusao'); requestSpectacle('meteoros')
  assert.deepEqual(takeSpectacles(), ['fusao', 'meteoros'])
  assert.deepEqual(takeSpectacles(), [])
})
