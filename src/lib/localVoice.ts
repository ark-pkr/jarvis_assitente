import { BRIDGE_HTTP_URL } from '../config'

/**
 * The voice made on this computer (Piper), as the interface sees it: whether it
 * is installed, and asking for it to be. The first time, the program and the
 * voice download (about 85 MB); until then the previous voice speaks.
 */
export type LocalVoiceState = { state: 'ausente' | 'baixando' | 'pronto' | 'erro' | 'desconhecido'; progress: number; error: string }

let current: LocalVoiceState = { state: 'desconhecido', progress: 0, error: '' }
const listeners = new Set<(state: LocalVoiceState) => void>()
let polling: ReturnType<typeof setTimeout> | null = null

export const localVoiceState = () => current
export const localVoiceReady = () => current.state === 'pronto'
export function onLocalVoice(listener: (state: LocalVoiceState) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const update = (next: LocalVoiceState) => {
  current = next
  for (const listener of listeners) listener(next)
}

const read = async (method: 'GET' | 'POST', path: string) => {
  const response = await fetch(`${BRIDGE_HTTP_URL}${path}`, { method, signal: AbortSignal.timeout(5000) })
  const body = await response.json() as Partial<LocalVoiceState>
  return { state: body.state ?? 'erro', progress: body.progress ?? 0, error: body.error ?? '' } as LocalVoiceState
}

/** Installs it if needed and follows the download until it is ready or has failed. */
export async function ensureLocalVoice(): Promise<LocalVoiceState> {
  try {
    let state = await read('GET', '/voice/local/status')
    if (state.state === 'ausente' || state.state === 'erro') state = await read('POST', '/voice/local/install')
    update(state)
    if (state.state === 'baixando' && !polling) {
      const follow = async () => {
        polling = null
        try {
          const next = await read('GET', '/voice/local/status')
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

export const localVoiceUrl = (text: string) => `${BRIDGE_HTTP_URL}/voice/local?text=${encodeURIComponent(text)}`
