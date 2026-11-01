import { BRIDGE_WS_URL } from '../config'
import { createFramer } from './localWake'

/**
 * A speech segment on its way to the transcriber while it is being said.
 *
 * Only the bridge talks to Gemini, so the key stays there. A null answer means
 * this path failed, and the caller still holds the whole segment to send the
 * ordinary way.
 */

export type LiveAnswer = { text: string }
export type LiveStt = {
  feed: (samples: Float32Array, rate: number) => void
  finish: () => Promise<LiveAnswer | null>
  abort: () => void
}

const RATE = 16000
/** A hundred milliseconds, the size the transcriber asks for. */
const FRAME = 1600
/** Longer than the bridge's own limit, for the case where the bridge itself is stuck. */
const ANSWER_MS = 3000

export function openLiveStt(): LiveStt {
  const socket = new WebSocket(new URL('/stt/live', BRIDGE_WS_URL))
  const waiting: (ArrayBuffer | string)[] = []
  let settle: (answer: LiveAnswer | null) => void = () => {}
  const answered = new Promise<LiveAnswer | null>((resolve) => { settle = resolve })

  const send = (message: ArrayBuffer | string) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(message)
    else if (socket.readyState === WebSocket.CONNECTING) waiting.push(message)
  }
  socket.onopen = () => { for (const message of waiting.splice(0)) socket.send(message) }
  socket.onmessage = ({ data }) => {
    try {
      const { text } = JSON.parse(String(data)) as { text?: unknown }
      settle(typeof text === 'string' ? { text } : null)
    } catch { settle(null) }
  }
  socket.onerror = () => settle(null)
  socket.onclose = () => settle(null)

  const feed = createFramer(FRAME, RATE, (frame) => send(frame.buffer as ArrayBuffer))
  return {
    feed,
    finish: () => {
      send('end')
      const timer = setTimeout(() => settle(null), ANSWER_MS)
      return answered.finally(() => clearTimeout(timer))
    },
    abort: () => {
      settle(null)
      socket.close()
    },
  }
}
