import test from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL_LEVELS, MAX_WIDTH, nextQuality, pictureSize, SAMPLE_FRAMES } from '../src/scene/holoQuality.ts'
import { bandsFrom, easeBands, SILENT } from '../src/lib/voiceBands.ts'
import { orbitRate, PLANETS, planetsAt } from '../src/scene/planets.ts'

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

/** Distance from the hole and radius of each world, from what the shader is sent. */
const worlds = (...args) => {
  const flat = planetsAt(...args)
  return PLANETS.map((_, index) => {
    const [x, y, z, size] = flat.slice(index * 4, index * 4 + 4)
    return { x, y, z, size, reach: Math.hypot(x, y, z) }
  })
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('a world stays on its circle wherever it has turned to, leaning out of the disc', () => {
  for (const turn of [0, 1.7, 40, 9000]) worlds(turn, 0, 1, SILENT).forEach(({ reach }, index) => close(reach, PLANETS[index].orbit))
  for (const [index, { tilt }] of PLANETS.entries()) {
    const heights = Array.from({ length: 400 }, (_, step) => Math.abs(worlds(step * 3, 0, 1, SILENT)[index].y))
    assert.ok(Math.max(...heights) > PLANETS[index].orbit * Math.sin(Math.abs(tilt)) * .9)
  }
})

test('further out is slower, turning the same way as the gas', () => {
  const rates = PLANETS.map(({ orbit }) => orbitRate(orbit))
  assert.ok(rates.every((rate) => rate < 0))
  for (const [index, rate] of rates.slice(1).entries()) assert.ok(Math.abs(rate) < Math.abs(rates[index]))
})

test('your voice draws the worlds in, and his sends them out', () => {
  const still = worlds(3, 0, 1, SILENT)
  const heard = worlds(3, .6, 1, SILENT)
  const spoken = worlds(3, -.6, 1, SILENT)
  still.forEach(({ reach }, index) => assert.ok(heard[index].reach < reach && reach < spoken[index].reach))
})

test('at full voice no world reaches the gas it started outside of, the hole or the camera', () => {
  const loud = { bass: 1, mid: 1, treble: 1 }
  for (const world of worlds(0, 1, 1, loud)) assert.ok(world.reach - world.size > 2.7, `caiu no buraco: ${world.reach}`)
  for (const world of worlds(0, -1, 1, loud)) assert.ok(world.reach + world.size < 24 - 2, `bateu na câmera: ${world.reach}`)
})

test('each part of the voice swells its own world', () => {
  const still = worlds(0, 0, 1, SILENT)
  for (const voice of ['bass', 'mid', 'treble']) {
    const sung = worlds(0, 0, 1, { ...SILENT, [voice]: 1 })
    PLANETS.forEach((planet, index) => {
      if (planet.voice === voice) assert.ok(sung[index].size > still[index].size)
      else close(sung[index].size, still[index].size)
    })
  }
})

test('with no presence there are no worlds to trace', () => {
  assert.ok(worlds(5, .5, 0, { bass: 1, mid: 1, treble: 1 }).every(({ size }) => size === 0))
})
