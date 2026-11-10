/**
 * The rare things that happen around the black hole, as plain numbers over time:
 * the opening flight, a second hole spiralling in and merging, meteor showers on
 * special days. Kept apart from the canvas so each can be tested without one.
 */

const ease = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// ---------------------------------------------------------------------------
// The opening: the camera flies in from far away and the disc lights up.
// ---------------------------------------------------------------------------

export const INTRO_SECONDS = 6.5

export type IntroFrame = {
  /** Multiplies the usual camera distance: 7 at the start, 1 when it lands. */
  distance: number
  /** Extra camera pitch, coming down from above onto the disc. */
  pitch: number
  /** How lit the disc is, 0 to 1. */
  light: number
  /** How fast the camera is moving, 0 to 1: the stars streak with it. */
  warp: number
}

export const INTRO_DONE: IntroFrame = { distance: 1, pitch: 0, light: 1, warp: 0 }

export function introAt(seconds: number): IntroFrame {
  const x = clamp01(seconds / INTRO_SECONDS)
  if (x >= 1) return INTRO_DONE
  const left = 1 - x
  return {
    distance: 1 + 6 * left ** 3,
    pitch: .35 * left ** 2,
    light: ease(clamp01((x - .25) / .65)),
    warp: left ** 2,
  }
}

// ---------------------------------------------------------------------------
// Two black holes merging.
// ---------------------------------------------------------------------------

/** Time spent spiralling in; the merger happens at the end of it. */
const INSPIRAL = 18
/** What follows the merger: the flash and the waves going out. */
const AFTERMATH = 7
export const MERGER_SECONDS = INSPIRAL + AFTERMATH
const START_ORBIT = 10
/** Schwarzschild radius of the smaller hole; the big one's is 1. */
const COMPANION = .3
const TILT = .15

export type MergerFrame = {
  /** Where the smaller hole is, and its size; size 0 means it is not there. */
  x: number; y: number; z: number; size: number
  /** The burst of light at the merger, 0 to 1. */
  flash: number
  /** Seconds since the merger, for the waves; negative before it. */
  waveTime: number
  /** How strong the waves still are, 0 to 1. */
  wave: number
}

export const NO_MERGER: MergerFrame = { x: 0, y: 0, z: 0, size: 0, flash: 0, waveTime: -1, wave: 0 }

export function mergerAt(seconds: number): MergerFrame {
  if (seconds < 0 || seconds >= MERGER_SECONDS) return NO_MERGER
  if (seconds < INSPIRAL) {
    // A shrinking orbit goes as the fourth root of the time left, and the angle as
    // its 5/8 power: the chirp of a real inspiral, slow at first and frantic at the end.
    const left = Math.max(INSPIRAL - seconds, .0005)
    const orbit = Math.max(1.1, START_ORBIT * (left / INSPIRAL) ** .25)
    const angle = -1.655 * left ** .625
    const size = COMPANION * ease(clamp01(seconds / 2))
    return {
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit * Math.sin(TILT),
      z: Math.sin(angle) * orbit * Math.cos(TILT),
      size, flash: 0, waveTime: -1, wave: 0,
    }
  }
  const after = seconds - INSPIRAL
  return { ...NO_MERGER, flash: Math.exp(-after * 1.5), waveTime: after, wave: Math.exp(-after * .35) * clamp01((AFTERMATH - after) / 1.5) }
}

/** When the next merger may happen on its own: two to four hours from now. */
export const nextMergerIn = (random = Math.random) => (2 + random() * 2) * 3600_000

// ---------------------------------------------------------------------------
// Meteor showers on special days.
// ---------------------------------------------------------------------------

export type SpecialDay = 'ano-novo' | 'natal' | 'aniversario'

/** "DD/MM", as typed in the settings, or null if it does not read as a date. */
export function parseBirthday(value: string): { day: number; month: number } | null {
  const found = value.trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/)
  if (!found) return null
  const day = Number(found[1]), month = Number(found[2])
  if (month < 1 || month > 12 || day < 1 || day > new Date(2024, month, 0).getDate()) return null
  return { day, month }
}

export function specialDay(when: Date, birthday = ''): SpecialDay | null {
  const day = when.getDate(), month = when.getMonth() + 1, hour = when.getHours()
  if ((month === 12 && day === 31 && hour >= 18) || (month === 1 && day === 1)) return 'ano-novo'
  if ((month === 12 && day === 24 && hour >= 18) || (month === 12 && day === 25)) return 'natal'
  const born = parseBirthday(birthday)
  if (born && born.day === day && born.month === month) return 'aniversario'
  return null
}

/** One minute of meteors every quarter of an hour, easing in and out. */
const SHOWER_EVERY_MIN = 15
const SHOWER_SECONDS = 60

/**
 * How heavy the meteor shower is right now, 0 to 1. On a special day a shower
 * comes every quarter of an hour; the turn of the year gets one without a break.
 */
export function meteorShower(when: Date, birthday = ''): number {
  const special = specialDay(when, birthday)
  if (!special) return 0
  const minutes = when.getHours() * 60 + when.getMinutes()
  if (special === 'ano-novo' && (minutes >= 23 * 60 + 55 || minutes < 10)) return 1
  const into = (minutes % SHOWER_EVERY_MIN) * 60 + when.getSeconds()
  if (into >= SHOWER_SECONDS) return 0
  return ease(clamp01(into / 5)) * ease(clamp01((SHOWER_SECONDS - into) / 5))
}

/** A shower asked for by voice: this long, easing in and out the same way. */
export const ASKED_SHOWER_SECONDS = 40
export const askedShower = (seconds: number) =>
  seconds < 0 || seconds >= ASKED_SHOWER_SECONDS ? 0 : ease(clamp01(seconds / 4)) * ease(clamp01((ASKED_SHOWER_SECONDS - seconds) / 4))

// ---------------------------------------------------------------------------
// Asking for one by voice.
// ---------------------------------------------------------------------------

export type Spectacle = 'fusao' | 'meteoros' | 'abertura'
let asked: Spectacle[] = []
/** Called by the interface when JARVIS is asked for a show. */
export const requestSpectacle = (kind: Spectacle) => { asked.push(kind) }
/** Read once by the painter, which starts whatever was asked for. */
export const takeSpectacles = () => { const taken = asked; asked = []; return taken }
