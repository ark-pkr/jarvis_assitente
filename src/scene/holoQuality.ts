/**
 * How much of the black hole this computer can carry.
 *
 * Every pixel is a ray traced through curved space, so the number of pixels is
 * the whole cost. The canvas stretches a smaller picture to the window, and gas
 * and light survive that well; a dropped frame does not. It steps down on
 * measurement rather than guessing from the hardware, because a browser will not
 * say which GPU it is on, and never climbs back: a picture that keeps changing
 * sharpness is worse than a softer one.
 */

export const DETAIL_LEVELS: readonly number[] = [1, .8, .64, .5, .4]

/** Beyond this width there is nothing left to see, only a graphics card to heat. */
export const MAX_WIDTH = 2560

/** Frames in one measurement, about two seconds at full speed. */
export const SAMPLE_FRAMES = 120
/** Slower than this, about 42 frames a second, is visibly not smooth. */
const SLOW_FRAME_MS = 24

/** A fifth of the frames can stall on other work without it counting against the GPU. */
export function nextQuality(index: number, frameMs: readonly number[]): number {
  if (index >= DETAIL_LEVELS.length - 1 || !frameMs.length) return index
  const sorted = [...frameMs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * .8)] > SLOW_FRAME_MS ? index + 1 : index
}

/** The size of the picture actually calculated for a window this large. */
export function pictureSize(width: number, height: number, detail: number) {
  const scale = Math.min(detail, MAX_WIDTH / Math.max(1, width))
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)) }
}
