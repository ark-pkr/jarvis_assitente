import { BRIDGE_HTTP_URL } from '../config'
import { useStore } from '../store'
import { diag } from './tts'

const errors: string[] = []
const note = (text: string) => {
  errors.push(`${new Date().toTimeString().slice(0, 8)} ${text}`)
  if (errors.length > 20) errors.shift()
}
window.addEventListener('error', (event) => note(event.message))
window.addEventListener('unhandledrejection', (event) => note(String((event.reason as Error)?.message ?? event.reason)))

/** The service writes the report, so everything in it goes through the same redaction. */
export async function diagnosticText() {
  // lastText is something he said, and has no place in a text meant to be passed around.
  const speech = { ...diag, lastText: undefined }
  const response = await fetch(`${BRIDGE_HTTP_URL}/diagnostics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phase: useStore.getState().phase, screen: `${innerWidth}x${innerHeight}`, speech, errors }),
  })
  if (!response.ok) throw new Error('O serviço local não respondeu.')
  return response.text()
}
