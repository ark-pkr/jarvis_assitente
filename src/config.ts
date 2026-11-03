/**
 * JARVIS configuration.
 *
 * Everything here is read from Vite env vars (.env.local) so no secrets are
 * committed. See .env.example for the full list.
 */

/**
 * Vite inlines a blank `.env` entry as an empty string, not as undefined, so
 * `??` never falls through to the default — and .env.example ships every
 * optional key blank, which is exactly the shape that used to bite. A blank
 * a blank value has to fall back to the default rather than override it.
 * Treat whitespace-only as unset everywhere in this file.
 */
function str(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value === '' ? undefined : value
}

/** On/off options. Accepts true/false and 1/0. */
function flag(name: string, raw: unknown, fallback: boolean): boolean {
  const value = str(raw)?.toLowerCase()
  if (value === undefined) return fallback
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  console.warn(`[jarvis] ${name}="${value}" is not true or false — using ${fallback}.`)
  return fallback
}

/**
 * Where the bridge lives. Derived once here rather than in each of the three
 * places that talk to it, so moving off the default port is a single edit.
 * `wss://` maps to `https://` on its own, which is why this is a prefix swap
 * rather than a hardcoded scheme.
 */
export const BRIDGE_WS_URL = window.jarvisDesktop?.bridgeUrl ?? str(import.meta.env.VITE_BRIDGE_URL) ?? `ws://localhost:${__JARVIS_BRIDGE_PORT__}`
export const BRIDGE_HTTP_URL = BRIDGE_WS_URL.replace(/^ws/, 'http')

/**
 * Speech output engine.
 *
 * false (default) — the browser's own speechSynthesis. Runs on-device, so
 *   speech starts on the next frame with no request and no download. This is
 *   the fastest option that exists and it's why it's the default.
 *
 * true — ElevenLabs. Noticeably better voice, but every sentence costs a
 *   round trip plus generation, which is the difference between a conversation
 *   and a walkie-talkie. Turn it on when you want the voice more than the pace.
 */
export const USE_ELEVENLABS = flag(
  'VITE_USE_ELEVENLABS',
  import.meta.env.VITE_USE_ELEVENLABS,
  false,
)

export const env = {
  elevenKey: str(import.meta.env.VITE_ELEVENLABS_API_KEY) ?? '',
  elevenVoiceId:
    str(import.meta.env.VITE_ELEVENLABS_VOICE_ID) ?? 'JBFqnCBsd6RMkjVDRZzb',
  porcupineKey: str(import.meta.env.VITE_PICOVOICE_ACCESS_KEY) ?? '',
}

/**
 * Wake-word engine.
 *   'speech'    — zero setup, uses the browser's SpeechRecognition to listen for
 *                 "hey jarvis". Chrome/Edge only, audio goes to Google.
 *   'porcupine' — recommended. Runs offline in WASM, "Jarvis" is a built-in
 *                 keyword, far fewer false triggers. Needs a free AccessKey
 *                 from console.picovoice.ai.
 */
export const WAKE_ENGINE: 'speech' | 'porcupine' = env.porcupineKey
  ? 'porcupine'
  : 'speech'
