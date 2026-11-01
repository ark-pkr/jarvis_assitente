/**
 * Faster speech at the same pitch, on audio that is still arriving.
 *
 * An <audio> element does this for free, but it holds a stream back until nearly
 * all of it has arrived, which is the delay streaming exists to remove. Web Audio
 * starts at once but only resamples, so 1.25× would sound like a smaller person.
 *
 * This is WSOLA: cut overlapping frames, read them further apart than they are
 * written, and nudge each one to where it lines up with the last so the speech
 * does not flutter. Enough for a voice at the speeds the app offers, and a block
 * at a time, because the end of the audio is not known yet.
 */

const WINDOW_SECONDS = .02
const SEARCH_SECONDS = .005

export type Stretcher = { push: (samples: Float32Array) => Float32Array; flush: () => Float32Array }

const join = (first: Float32Array, second: Float32Array) => {
  const out = new Float32Array(first.length + second.length)
  out.set(first)
  out.set(second, first.length)
  return out
}

export function createStretcher(rate: number, sampleRate: number): Stretcher {
  if (Math.abs(rate - 1) < .01) return { push: (samples) => samples, flush: () => new Float32Array(0) }
  const size = Math.round(sampleRate * WINDOW_SECONDS) & ~1
  const hop = size / 2
  const search = Math.round(sampleRate * SEARCH_SECONDS)
  const window = Float32Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / size))

  let input = new Float32Array(0)
  /** Where the next frame ideally starts, relative to `input`. */
  let position = 0
  /** Where the frame just written would have continued, had it not been cut. */
  let continuation = -1
  const tail = new Float32Array(hop)

  const bestStart = (ideal: number) => {
    if (continuation < 0) return ideal
    let best = ideal
    let score = -Infinity
    const from = Math.max(0, ideal - search)
    for (let start = from; start <= ideal + search; start++) {
      let sum = 0
      for (let i = 0; i < hop; i += 2) sum += input[start + i] * input[continuation + i]
      if (sum > score) { score = sum; best = start }
    }
    return best
  }

  const process = (flushing: boolean) => {
    const output: number[] = []
    for (;;) {
      const ideal = Math.floor(position)
      if (ideal + size + search >= input.length) break
      const start = bestStart(ideal)
      for (let i = 0; i < hop; i++) output.push(tail[i] + input[start + i] * window[i])
      for (let i = 0; i < hop; i++) tail[i] = input[start + hop + i] * window[hop + i]
      continuation = start + hop
      position += hop * rate
    }
    if (flushing) output.push(...tail)
    // What every future frame is past can go; a long answer would otherwise
    // keep the whole of itself in this buffer.
    const keep = Math.max(0, Math.min(Math.floor(position), continuation) - search)
    if (keep > 0) {
      input = input.slice(keep)
      position -= keep
      continuation -= keep
    }
    return Float32Array.from(output)
  }

  return {
    push(samples) {
      input = join(input, samples)
      return process(false)
    },
    flush() {
      // Padded so the last real samples get a full frame of their own.
      input = join(input, new Float32Array(size + search))
      return process(true)
    },
  }
}
