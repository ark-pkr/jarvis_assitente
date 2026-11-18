import { BRIDGE_HTTP_URL } from '../config'

/**
 * The parts of him that run on this computer, as the interface sees them:
 * whether each is installed, and asking for it to be. The first time, each
 * downloads once; until it is ready, the previous way keeps working.
 *
 *   voice   — Piper, the Faber voice (about 85 MB)
 *   watcher — Whisper, listening only for his name (about 157 MB)
 */
export type LocalState = { state: 'ausente' | 'baixando' | 'pronto' | 'erro' | 'desconhecido'; progress: number; error: string }
/** Kept for the settings panel, which names the voice's state by this. */
export type LocalVoiceState = LocalState

function createLocalTool(base: string) {
  let current: LocalState = { state: 'desconhecido', progress: 0, error: '' }
  const listeners = new Set<(state: LocalState) => void>()
  let polling: ReturnType<typeof setTimeout> | null = null

  const update = (next: LocalState) => {
    current = next
    for (const listener of listeners) listener(next)
  }
  const read = async (method: 'GET' | 'POST', path: string) => {
    const response = await fetch(`${BRIDGE_HTTP_URL}${base}${path}`, { method, signal: AbortSignal.timeout(5000) })
    const body = await response.json() as Partial<LocalState>
    return { state: body.state ?? 'erro', progress: body.progress ?? 0, error: body.error ?? '' } as LocalState
  }

  /** Installs it if needed and follows the download until it is ready or has failed. */
  async function ensure(): Promise<LocalState> {
    try {
      let state = await read('GET', '/status')
      if (state.state === 'ausente' || state.state === 'erro') state = await read('POST', '/install')
      update(state)
      if (state.state === 'baixando' && !polling) {
        const follow = async () => {
          polling = null
          try {
            const next = await read('GET', '/status')
            update(next)
            if (next.state === 'baixando') polling = setTimeout(follow, 1500)
          } catch { polling = setTimeout(follow, 3000) }
        }
        polling = setTimeout(follow, 1500)
      }
      return state
    } catch {
      // The bridge is not up yet; the next start-up asks again.
      return current
    }
  }

  return {
    state: () => current,
    ready: () => current.state === 'pronto',
    on(listener: (state: LocalState) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ensure,
  }
}

const voice = createLocalTool('/voice/local')
export const localVoiceState = voice.state
export const localVoiceReady = voice.ready
export const onLocalVoice = voice.on
export const ensureLocalVoice = voice.ensure
export const localVoiceUrl = (text: string) => `${BRIDGE_HTTP_URL}/voice/local?text=${encodeURIComponent(text)}`

const watcher = createLocalTool('/stt/watch')
export const localWatcherState = watcher.state
export const localWatcherReady = watcher.ready
export const onLocalWatcher = watcher.on
export const ensureLocalWatcher = watcher.ensure

/**
 * What Whisper heard in one sentence, or null if the watcher could not say, in
 * which case the sentence goes the old way rather than being lost.
 */
export async function watchLocally(wav: Blob, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`${BRIDGE_HTTP_URL}/stt/watch`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) })
    if (!response.ok) return null
    const { text } = await response.json() as { text?: string }
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}
