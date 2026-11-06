/**
 * How much of the day it is, for the black hole: 1 in full daylight, 0 deep in the
 * night, easing across dawn and dusk so the change is never noticed as a step.
 *
 * Read from the computer's own clock, which is the place the user is in.
 */
const DAWN_FROM = 5
const DAWN_TO = 8
const DUSK_FROM = 18
const DUSK_TO = 22

const ease = (x: number) => x * x * (3 - 2 * x)

export function daylight(when: Date = new Date()): number {
  const hour = when.getHours() + when.getMinutes() / 60
  if (hour < DAWN_FROM || hour >= DUSK_TO) return 0
  if (hour < DAWN_TO) return ease((hour - DAWN_FROM) / (DAWN_TO - DAWN_FROM))
  if (hour < DUSK_FROM) return 1
  return ease(1 - (hour - DUSK_FROM) / (DUSK_TO - DUSK_FROM))
}

/**
 * What the time of day does to the picture. At night it is dimmer and slower,
 * company in a dark room rather than a light in the eyes; by day, fully vivid.
 * Never so dark that a phase stops reading: a call at 2 a.m. still lights it up.
 */
export function dayShade(light: number): { glow: number; spin: number } {
  const day = Math.min(1, Math.max(0, light))
  return { glow: .72 + day * .28, spin: .7 + day * .3 }
}
