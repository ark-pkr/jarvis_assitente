import test from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL_LEVELS, MAX_WIDTH, nextQuality, pictureSize, SAMPLE_FRAMES } from '../src/scene/holoQuality.ts'
import { bandsFrom, easeBands, SILENT } from '../src/lib/voiceBands.ts'

const frames = (ms, count = SAMPLE_FRAMES) => Array.from({ length: count }, () => ms)
/** A spectrum with energy only around one frequency, as an analyser reports it. */
const tone = (hertz, sampleRate = 48000, size = 128) => {
  const bins = new Uint8Array(size)
  bins[Math.round(hertz / (sampleRate / 2 / size))] = 255
  return bins
}

test('a computer that keeps up stays at full detail', () => {
  assert.equal(nextQuality(0, frames(16.7)), 0)
})

test('a computer that falls behind steps down one level at a time, and stops at the floor', () => {
  assert.equal(nextQuality(0, frames(33)), 1)
  assert.equal(nextQuality(2, frames(33)), 3)
  assert.equal(nextQuality(DETAIL_LEVELS.length - 1, frames(100)), DETAIL_LEVELS.length - 1)
})

test('a few stalled frames are the system, not the graphics card', () => {
  const stalled = [...frames(16.7, 110), ...frames(200, 10)]
  assert.equal(nextQuality(0, stalled), 0)
})

test('less is calculated at every step down', () => {
  for (const [index, detail] of DETAIL_LEVELS.slice(1).entries()) assert.ok(detail < DETAIL_LEVELS[index])
})

test('the picture follows the window and its shape', () => {
  assert.deepEqual(pictureSize(1920, 1080, 1), { width: 1920, height: 1080 })
  assert.deepEqual(pictureSize(1920, 1080, .5), { width: 960, height: 540 })
})

test('a huge screen does not pay for pixels nobody can tell apart', () => {
  const size = pictureSize(3840, 2160, 1)
  assert.equal(size.width, MAX_WIDTH)
  assert.equal(size.height, Math.round(2160 * MAX_WIDTH / 3840))
})

test('a window with no size yet still gets a valid picture', () => {
  assert.deepEqual(pictureSize(0, 0, 1), { width: 2, height: 2 })
})

test('each part of the voice lands in its own band', () => {
  const low = bandsFrom(tone(200), 48000)
  const middle = bandsFrom(tone(1000), 48000)
  const high = bandsFrom(tone(4000), 48000)
  assert.ok(low.bass > low.mid && low.bass > low.treble, JSON.stringify(low))
  assert.ok(middle.mid > middle.bass && middle.mid > middle.treble, JSON.stringify(middle))
  assert.ok(high.treble > high.bass && high.treble > high.mid, JSON.stringify(high))
})

test('silence is silent, and full volume stays in range', () => {
  assert.deepEqual(bandsFrom(new Uint8Array(128), 48000), SILENT)
  const loud = bandsFrom(new Uint8Array(128).fill(255), 48000)
  assert.ok(Object.values(loud).every((value) => value <= 1 && value > 0))
})

test('the light rises with a sound faster than it falls away', () => {
  const up = easeBands(SILENT, { bass: 1, mid: 1, treble: 1 }, .033)
  const down = easeBands({ bass: 1, mid: 1, treble: 1 }, SILENT, .033)
  assert.ok(up.bass > 1 - down.bass)
})
