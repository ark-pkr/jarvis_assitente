import type { PorcupineWorker } from '@picovoice/porcupine-web'

/**
 * Hearing his name on this computer.
 *
 * Without this, every sentence said near the microphone has to be sent to the
 * transcriber just to find out whether it began with "Jarvis". Porcupine answers
 * that question here, so what is not addressed to him never leaves the machine,
 * costs nothing, and he can be stopped mid-sentence, while the capture path is
 * deliberately deaf to avoid hearing his own voice.
 *
 * The audio comes from the voice loop rather than from Porcupine's own recorder:
 * a second getUserMedia makes Chrome drop the first, see audio.ts.
 */

const MODEL = { publicPath: '/porcupine_params.pv', customWritePath: 'jarvis-porcupine-4', version: 1 }
/** Above the default of .5: a missed call costs a repeat, a false one sends audio out. */
const SENSITIVITY = .6

export type LocalWake = { feed: (samples: Float32Array, sourceRate: number) => void; stop: () => void }

/**
 * Turns the capture stream into the fixed 16-bit frames the engine wants,
 * averaging the samples each output sample stands for. Fractional rates are
 * carried across calls, or the pitch would drift at every block boundary.
 */
export function createFramer(frameLength: number, targetRate: number, emit: (frame: Int16Array) => void) {
  let frame = new Int16Array(frameLength)
  let filled = 0
  let position = 0
  let total = 0
  let count = 0
  return (samples: Float32Array, sourceRate: number) => {
    const step = sourceRate / targetRate
    for (const sample of samples) {
      total += sample
      count++
      position++
      if (position < step) continue
      position -= step
      const value = Math.max(-1, Math.min(1, total / count))
      total = 0
      count = 0
      frame[filled++] = value * (value < 0 ? 32768 : 32767)
      if (filled === frameLength) {
        emit(frame)
        frame = new Int16Array(frameLength)
        filled = 0
      }
    }
  }
}

export async function startLocalWake(accessKey: string, onDetected: () => void): Promise<LocalWake> {
  const { BuiltInKeyword, PorcupineWorker } = await import('@picovoice/porcupine-web')
  const worker: PorcupineWorker = await PorcupineWorker.create(
    accessKey,
    [{ builtin: BuiltInKeyword.Jarvis, sensitivity: SENSITIVITY }],
    () => onDetected(),
    MODEL,
  )
  const feed = createFramer(worker.frameLength, worker.sampleRate, (frame) => worker.process(frame))
  let stopped = false
  return {
    feed: (samples, sourceRate) => { if (!stopped) feed(samples, sourceRate) },
    stop: () => {
      stopped = true
      void worker.release().then(() => worker.terminate()).catch(() => {})
    },
  }
}

/**
 * With local detection on, a segment only leaves the machine if it was addressed
 * to him: the name was heard, or a follow-up window was open when it began.
 */
export function segmentMaySend(state: { localWake: boolean; heldText: boolean; addressedAtStart: boolean; addressedUntil: number; now: number }) {
  return !state.localWake || state.heldText || state.addressedAtStart || state.now <= state.addressedUntil
}
