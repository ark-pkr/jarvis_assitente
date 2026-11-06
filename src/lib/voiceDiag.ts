// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Live state of the voice loop, published on `window.__voice`.
 *
 * When someone says the wake word and nothing happens there are only a handful
 * of possible causes — the recogniser never started, it started and died, it is
 * running but hearing silence, or it is hearing you and transcribing the name
 * as something else. From outside the page those are indistinguishable, which
 * makes the failure impossible to report and impossible to fix. This tells them
 * apart in one glance.
 */
export const diag = {
  /** Which input engine is running: Gemini, ElevenLabs, or browser recognition. */
  engine: 'browser',
  /** Whether the microphone pipeline is live. */
  running: false,
  /** Speech segments captured since load. */
  sessions: 0,
  /** The most recent transcript, whatever the mode. */
  heard: '',
  heardAt: 0,
  /** Last failure — a transcription error, or a capture error. */
  lastError: '',
  /** Times the wake word matched. */
  wakes: 0,
  /** Whether "Jarvis" is being detected on this machine. */
  localWake: false,
  /** Current mode, as the app last reported it. */
  mode: '',
  /** Why the last transcript was ignored — '' when it was accepted. */
  dropped: '',
  /** Transcripts accepted and passed to the app. */
  accepted: 0,
  /** Text assembled but not yet sent, because the thought looks unfinished. */
  holding: '',
  /** How long the assembler decided to wait before sending, in ms. */
  waitedMs: 0,
  /** Barge-ins suppressed because he had only just started the sentence. */
  selfGuarded: 0,
  /** Automatic restarts of the browser recognition service. */
  restarts: 0,
  /** Failed speech-to-text requests, separate from recogniser restarts. */
  transcriptionFailures: 0,
  /** Milliseconds the last transcription round-trip took. */
  idleMs: 0,
}

/** Record why a transcript went nowhere. Silence always has a reason; this is
 *  the difference between debugging it and speculating about it. */
export function drop(why: string) {
  diag.dropped = why
}

/**
 * Why the last spoken request was taken as his: a fixed word, never what was
 * said. It rides along with that request to the bridge log, so an answer nobody
 * asked for can be traced to the door it came through.
 */
export type HeardVia = 'nome' | 'nome no computador' | 'janela após o nome' | 'janela de conversa' | 'sem checagem'
let heardVia: HeardVia | '' = ''
export const markHeard = (via: HeardVia) => { heardVia = via }
/** Read once: a request typed afterwards carries nothing. */
export const takeHeard = () => { const via = heardVia; heardVia = ''; return via }

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__voice = diag
}
