/**
 * The voice split into the three parts the eye can tell apart.
 *
 * A single loudness makes everything pulse together, which reads as a volume
 * meter. Bass, mid and treble move different things, and that reads as a voice.
 */

export type Bands = { bass: number; mid: number; treble: number }

export const SILENT: Bands = { bass: 0, mid: 0, treble: 0 }

/** Where speech has its body, its vowels and its consonants. */
const RANGES = { bass: [85, 300], mid: [300, 1800], treble: [1800, 6500] } as const
/** Speech is far quieter up high, so each band is stretched to fill its range. */
const GAIN = { bass: 1.5, mid: 2.2, treble: 4 } as const

export function bandsFrom(bins: Uint8Array, sampleRate: number): Bands {
  const hertz = sampleRate / 2 / bins.length
  const band = (name: keyof Bands) => {
    const [low, high] = RANGES[name]
    const first = Math.max(1, Math.floor(low / hertz))
    const last = Math.min(bins.length - 1, Math.ceil(high / hertz))
    let sum = 0
    for (let i = first; i <= last; i++) sum += bins[i]
    return Math.min(1, sum / Math.max(1, last - first + 1) / 255 * GAIN[name])
  }
  return { bass: band('bass'), mid: band('mid'), treble: band('treble') }
}

/** Rises with the sound and falls slowly, the way a light with some weight would. */
export function easeBands(current: Bands, target: Bands, seconds: number): Bands {
  const step = (key: keyof Bands) => {
    const rate = target[key] > current[key] ? 28 : 7
    return current[key] + (target[key] - current[key]) * (1 - Math.exp(-seconds * rate))
  }
  return { bass: step('bass'), mid: step('mid'), treble: step('treble') }
}

let output: AnalyserNode | null = null
let outputBins: Uint8Array<ArrayBuffer> | null = null

/** The analyser on JARVIS's own voice, for as long as a sentence is playing. */
export function setOutputAnalyser(analyser: AnalyserNode | null) {
  output = analyser
  outputBins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
}

export function outputBands(): Bands {
  if (!output || !outputBins) return SILENT
  output.getByteFrequencyData(outputBins)
  return bandsFrom(outputBins, output.context.sampleRate)
}
