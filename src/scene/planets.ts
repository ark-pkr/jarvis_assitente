import type { Bands } from '../lib/voiceBands'
import type { Rgb } from './sphereMood'

/**
 * The worlds around the hole, as numbers.
 *
 * They are drawn inside the ray tracer, so one passing behind the hole is bent
 * into an arc and one passing in front is a dark shape lit from the far side.
 * Only where they are is worked out here, so it can be tested without a canvas.
 *
 * The parts of a voice each own one world, as they each own one thing in the disc.
 */
export type Planet = {
  /** Distance from the hole. The gas ends at 11.5 and the camera sits at 24. */
  orbit: number
  size: number
  /** How far the orbit leans out of the plane of the disc, in radians. */
  tilt: number
  /** Which way it leans, in radians. */
  node: number
  /** Where it begins, in radians, so they do not line up. */
  start: number
  deep: Rgb
  pale: Rgb
  voice: keyof Bands
}

export const PLANETS: readonly Planet[] = [
  { orbit: 7.4, size: .3, tilt: .24, node: .8, start: 2.4, deep: [92, 38, 22], pale: [232, 150, 92], voice: 'treble' },
  { orbit: 12.8, size: .56, tilt: -.14, node: 2.2, start: .3, deep: [58, 72, 112], pale: [214, 196, 168], voice: 'bass' },
  { orbit: 16.4, size: .4, tilt: .3, node: 4.1, start: 4.3, deep: [26, 74, 92], pale: [168, 226, 214], voice: 'mid' },
]

/** The same constant the gas uses, so everything around the hole keeps one law. */
const KEPLER = 14.4
/** Turned up from the gas, or the outer world would take minutes to go anywhere. */
const PACE = 2
/** How far a voice at full strength moves them, as a share of the orbit. */
const GATHER = .22
/** How much a world swells on its part of the voice. */
const SWELL = .34

/** Radians per turn. Further out is slower, and turning forward is the way the gas goes. */
export const orbitRate = (orbit: number) => -PACE * KEPLER / orbit ** 1.5

/**
 * Centre and radius of each world, ready for the shader.
 *
 * `gather` above 0 draws them in, below 0 sends them out, and `presence` fades them
 * in and out. At no presence every radius is 0, which the shader takes as no worlds.
 */
export function planetsAt(turn: number, gather: number, presence: number, bands: Bands): number[] {
  return PLANETS.flatMap(({ orbit, size, tilt, node, start, voice }) => {
    const angle = start + turn * orbitRate(orbit)
    const reach = orbit * (1 - gather * GATHER)
    const flat = [Math.cos(angle) * reach, Math.sin(angle) * reach]
    // Lean the circle about the axis at `node`, in the plane of the disc.
    const across = Math.cos(node) * flat[1] - Math.sin(node) * flat[0]
    const along = Math.cos(node) * flat[0] + Math.sin(node) * flat[1]
    const level = Math.cos(tilt) * across
    return [
      Math.cos(node) * along - Math.sin(node) * level,
      Math.sin(tilt) * across,
      Math.sin(node) * along + Math.cos(node) * level,
      size * (1 + bands[voice] * SWELL) * presence,
    ]
  })
}
