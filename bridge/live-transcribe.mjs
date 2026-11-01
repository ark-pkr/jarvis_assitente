import { GoogleGenAI, Modality } from '@google/genai'
import { CUSTOM_VOCABULARY, isNoise } from './transcribe.mjs'

/**
 * Transcribing while the words are being said.
 *
 * Sending a finished segment costs about 1.4 s after the speaker has stopped.
 * Streaming it costs 0.1 to 0.3 s, measured over the same phrases with the same
 * text coming back, because the model has already heard everything by then.
 *
 * Each segment gets its own session. A long-lived one would save the 0.6 s it
 * takes to connect, but that happens while the speaker is still talking and the
 * audio simply queues, and these sessions are known to stay open while silently
 * returning nothing. Nothing here may lose a request, so every way this can go
 * wrong answers `fallback`, and the app sends the same audio the old way.
 */

export const LIVE_TRANSCRIPTION_PATH = '/stt/live'
/** Silence never produces a final transcript, so the wait needs its own end. */
const ANSWER_TIMEOUT_MS = 2000
const SESSION_LIMIT_MS = 120000

const connectGemini = (callbacks) => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).live.connect({
  model: process.env.JARVIS_LIVE_ASR_MODEL || 'gemini-3.5-transcribe-live',
  config: { responseModalities: [Modality.TEXT], inputAudioTranscription: { languageCodes: ['pt-BR'], customVocabulary: CUSTOM_VOCABULARY } },
  callbacks,
})

/**
 * One segment: 16 kHz PCM frames in, the text `end`, then one JSON answer.
 * The socket closes after the answer.
 */
export function serveLiveTranscription(socket, { connect = connectGemini, answerMs = ANSWER_TIMEOUT_MS, limitMs = SESSION_LIMIT_MS } = {}) {
  const finals = []
  const queued = []
  let session = null
  let endedAt = 0
  let talking = false
  let finished = false
  let waiting = null

  const finish = (answer) => {
    if (finished) return
    finished = true
    clearTimeout(waiting)
    clearTimeout(limit)
    try { session?.close() } catch { /* already gone */ }
    if (answer.text !== undefined) console.log(`[jarvis] transcrição ao vivo: ${Date.now() - endedAt} ms após o fim da fala`)
    if (answer.fallback) console.warn('[jarvis] transcrição ao vivo sem resposta; usando a transcrição comum')
    if (socket.readyState !== socket.OPEN) return
    socket.send(JSON.stringify(answer))
    socket.close()
  }
  const conclude = () => {
    const text = finals.join(' ').replace(/\s+/g, ' ').trim().slice(0, 12000)
    finish(text ? { text: isNoise(text) ? '' : text } : { fallback: true })
  }
  const send = (frame) => session.sendRealtimeInput({ audio: { data: frame.toString('base64'), mimeType: 'audio/pcm;rate=16000' } })
  const end = () => {
    session.sendRealtimeInput({ audioStreamEnd: true })
    // A long enough pause closes the utterance before the app decides the
    // speaker has finished, and then there is nothing left to wait for.
    if (finals.length && !talking) return conclude()
    waiting = setTimeout(conclude, answerMs)
  }
  const limit = setTimeout(() => finish({ fallback: true }), limitMs)

  socket.on('message', (data, isBinary) => {
    if (finished) return
    if (isBinary) {
      if (session) send(data)
      else queued.push(data)
      return
    }
    if (String(data) !== 'end' || endedAt) return
    endedAt = Date.now()
    if (session) end()
  })
  socket.on('close', () => finish({}))

  Promise.resolve().then(() => connect({
    onmessage: (message) => {
      const activity = message.voiceActivity?.type
      if (activity === 'ACTIVITY_START') talking = true
      if (activity === 'ACTIVITY_END') talking = false
      const content = message.serverContent
      if (content?.inputTranscription?.text) finals.push(content.inputTranscription.text)
      if (content?.generationComplete && endedAt && session) conclude()
    },
    onerror: () => finish({ fallback: true }),
    onclose: () => { if (endedAt) conclude(); else finish({ fallback: true }) },
  })).then((opened) => {
    if (finished) return void opened.close()
    session = opened
    for (const frame of queued.splice(0)) send(frame)
    if (endedAt) end()
  }).catch(() => finish({ fallback: true }))
}
