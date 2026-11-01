import type { Phase } from '../store'

/**
 * What the sphere is doing, as numbers.
 *
 * Each phase names a target and the painter eases towards it, so a change of
 * phase reads as the sphere shifting its attention rather than as a cut. Kept
 * apart from the canvas so the behaviour can be tested without one.
 */
export type Mood = {
  /** Radius multiplier. Below 1 draws in, as if leaning towards the speaker. */
  size: number
  /** Revolutions, roughly: the rotation speed of the whole sphere. */
  spin: number
  /** Overall brightness of the lattice. */
  glow: number
  /** How far the lattice moves from its base colour towards the accent. */
  tint: number
  /** Strength of the waves leaving the nucleus. */
  ripple: number
  /** How many signals travel the lattice. */
  signals: number
  /** How strongly the orbits sweep. */
  sweep: number
}

export type Rgb = readonly [number, number, number]

export const GOLD: Rgb = [255, 171, 78]
/** Thought is the one cool colour on the gold interface, so it reads instantly. */
const ICE: Rgb = [132, 214, 255]
const MINT: Rgb = [116, 240, 196]

const calm: Mood = { size: 1, spin: .1, glow: .55, tint: 0, ripple: 0, signals: 0, sweep: 0 }

export const MOODS: Record<Phase, Mood> = {
  offline: { ...calm, spin: .06, glow: .4 },
  boot: { ...calm, spin: .32, glow: .8 },
  dormant: calm,
  waking: { ...calm, size: .94, spin: .48, glow: 1 },
  listening: { ...calm, size: .9, spin: .14, glow: 1 },
  thinking: { ...calm, size: .96, spin: .3, glow: .85, tint: .55, signals: 16 },
  tooling: { ...calm, size: .98, spin: .38, glow: .9, tint: .45, signals: 7, sweep: 1 },
  speaking: { ...calm, spin: .22, glow: 1.1, ripple: 1 },
}

export const ACCENT: Partial<Record<Phase, Rgb>> = { thinking: ICE, tooling: MINT }

/** Moves `current` towards `target`, frame-rate independent. */
export function easeMood(current: Mood, target: Mood, seconds: number): Mood {
  const k = 1 - Math.exp(-seconds * 5)
  const step = (key: keyof Mood) => current[key] + (target[key] - current[key]) * k
  return {
    size: step('size'), spin: step('spin'), glow: step('glow'), tint: step('tint'),
    ripple: step('ripple'), signals: step('signals'), sweep: step('sweep'),
  }
}

export const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * amount),
  Math.round(from[1] + (to[1] - from[1]) * amount),
  Math.round(from[2] + (to[2] - from[2]) * amount),
]

/**
 * A colour JARVIS asked for, or null to stay gold. `ui_theme` takes any CSS
 * colour; anything that is not plain hex keeps the default rather than guess.
 */
export function parseColour(value: string | null | undefined): Rgb | null {
  const hex = value?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return null
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as unknown as Rgb
}

/** A signal crossing one edge of the lattice. */
export type Signal = { from: number; to: number; at: number; previous: number }

export function neighbours(count: number, edges: readonly (readonly [number, number])[]): number[][] {
  const near: number[][] = Array.from({ length: count }, () => [])
  for (const [a, b] of edges) { near[a].push(b); near[b].push(a) }
  return near
}

const pick = (options: readonly number[], random: () => number) => options[Math.floor(random() * options.length)]

export function spawnSignal(near: readonly number[][], random = Math.random): Signal {
  const from = Math.floor(random() * near.length)
  return { from, to: pick(near[from], random), at: 0, previous: -1 }
}

/**
 * Advances signals along the lattice and matches their number to `wanted`.
 * Never turning straight back is what makes them look like they are going
 * somewhere rather than vibrating on one edge.
 */
export function stepSignals(signals: Signal[], near: readonly number[][], wanted: number, seconds: number, random = Math.random): Signal[] {
  const moved = signals.map((signal) => {
    const at = signal.at + seconds * 2.6
    if (at < 1) return { ...signal, at }
    const onward = near[signal.to].filter((node) => node !== signal.from)
    const options = onward.length ? onward : near[signal.to]
    return { from: signal.to, to: pick(options, random), at: at - 1, previous: signal.from }
  })
  const target = Math.round(wanted)
  while (moved.length < target) moved.push(spawnSignal(near, random))
  return moved.slice(0, target)
}
