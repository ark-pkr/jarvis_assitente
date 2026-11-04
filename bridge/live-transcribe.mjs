import { GoogleGenAI, Modality } from '@google/genai'
import { isNoise, vocabulary } from './transcribe.mjs'

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
  config: { responseModalities: [Modality.TEXT], inputAudioTranscription: { languageCodes: ['pt-BR'], customVocabulary: vocabulary() } },
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
  /** The session answered its setup, so it is alive and listening. */
  let ready = false
  /** The model's own voice detector heard someone start to speak. */
  let heard = false
  let finished = false
  let waiting = null

  const finish = (answer) => {
    if (finished) return
    finished = true
    clearTimeout(waiting)
    clearTimeout(limit)
    try { session?.close() } catch { /* already gone */ }
    if (answer.noise) console.log('[jarvis] transcrição ao vivo: só ruído, nada a transcrever')
    else if (answer.text !== undefined) console.log(`[jarvis] transcrição ao vivo: ${Date.now() - endedAt} ms após o fim da fala`)
    if (answer.fallback) console.warn('[jarvis] transcrição ao vivo sem resposta; usando a transcrição comum')
    if (socket.readyState !== socket.OPEN) return
    socket.send(JSON.stringify(answer.noise ? { text: '' } : answer))
    socket.close()
  }
  /**
   * No words back is either a room with nobody talking or a session that went
   * quiet on us, and only the second deserves the ordinary transcriber. Silence
   * and noise get a setup answer and nothing else; speech always opens with the
   * model's ACTIVITY_START. So a live session that never heard anyone start is
   * noise, and sending it again cost a second request, and the app then stopped
   * streaming for a minute, leaving the next real sentence on the slow path.
   */
  const conclude = () => {
    const text = finals.join(' ').replace(/\s+/g, ' ').trim().slice(0, 12000)
    if (text) finish({ text: isNoise(text) ? '' : text })
    else finish(ready && !heard ? { noise: true } : { fallback: true })
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
      if (message.setupComplete) ready = true
      const activity = message.voiceActivity?.type
      if (activity === 'ACTIVITY_START') talking = heard = true
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
