import { GoogleGenAI } from '@google/genai'

export const GEMINI_TTS_VOICES = [
  'Charon', 'Orus', 'Kore', 'Puck',
]

export function selectGeminiVoice(voice) {
  return GEMINI_TTS_VOICES.includes(voice) ? voice : 'Charon'
}

export function pcmToWav(raw, rate = 24000) {
  if (!raw.length || raw.length % 2) throw new Error('Áudio PCM inválido.')
  const pcm = Buffer.from(raw)
  let peak = 0
  for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)))
  const gain = peak ? Math.min(2, 28000 / peak) : 1
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** Older voice models say pcm, newer ones audio/l16; it is the same audio. */
const PCM = /pcm|l16/i
const speechModel = () => process.env.JARVIS_TTS_MODEL || 'gemini-3.1-flash-tts-preview'
/** The daily quota is per model, so a spent one need not cost the voice. */
const SPARE_SPEECH_MODEL = 'gemini-3.8-flash-tts'
async function withSpeechModel(request) {
  try { return await request(speechModel()) } catch (error) {
    if (error.status !== 429 || speechModel() === SPARE_SPEECH_MODEL) throw error
    console.warn(`[jarvis] voz: cota de ${speechModel()} esgotada; usando ${SPARE_SPEECH_MODEL}`)
    return request(SPARE_SPEECH_MODEL)
  }
}
const speechPrompt = (text) => `Leia apenas o texto a seguir em português do Brasil, com fala direta, fluida e natural. Use ritmo de conversa ligeiramente acelerado, articulando com clareza. Conecte as frases e use pausas muito curtas, somente onde a pontuação for necessária à compreensão. Não fale pausadamente, não faça pausas dramáticas nem alongue palavras. Não acrescente palavras nem leia esta orientação.\n\n${text}`

/** A WAV header for audio of unknown length, which players read until the end. */
export function streamingWavHeader(rate) {
  const header = pcmToWav(Buffer.alloc(2), rate).subarray(0, 44)
  header.writeUInt32LE(0xffffffff, 4)
  header.writeUInt32LE(0xffffffff - 36, 40)
  return header
}

/** pcmToWav normalises to the peak, which a stream cannot know yet. */
const STREAM_GAIN = 1.5
export function amplified(pcm) {
  const out = Buffer.from(pcm)
  for (let i = 0; i + 1 < out.length; i += 2) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out.readInt16LE(i) * STREAM_GAIN))), i)
  return out
}

/**
 * The voice as it is generated, to be played while it arrives.
 *
 * Waiting for a whole sentence costs three to six seconds; the first audio of a
 * stream arrives in about one. Nothing is sent until that audio exists, so a
 * failure is still an HTTP error and the speaker can fall back to the system
 * voice.
 */
export async function handleSpeechStream(req, res, cors, ai) {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  let started = false
  const begun = Date.now()
  try {
    if (!process.env.GEMINI_API_KEY && !ai) { res.writeHead(503, cors); return res.end('Voz neural não configurada.') }
    const query = new URL(req.url, 'http://localhost').searchParams
    const text = query.get('text')?.trim() ?? ''
    if (!text || text.length > 4000) { res.writeHead(400, cors); return res.end('Texto inválido.') }
    const client = ai ?? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const stream = await withSpeechModel((model) => client.models.generateContentStream({
      model, contents: speechPrompt(text),
      config: { responseModalities: ['AUDIO'], abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectGeminiVoice(query.get('voice')) } } } },
    }))
    // Chunks can split a 16-bit sample, and a stray byte turns the rest to noise.
    let carry = Buffer.alloc(0)
    for await (const chunk of stream) {
      const audio = chunk.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
      if (!audio?.data) continue
      if (!PCM.test(audio.mimeType || '')) throw new Error('Formato de áudio inesperado.')
      if (!started) {
        started = true
        console.log(`[jarvis] voz: primeiro áudio em ${Date.now() - begun} ms`)
        res.writeHead(200, { ...cors, 'content-type': 'audio/wav', 'cache-control': 'no-store', 'accept-ranges': 'none' })
        res.write(streamingWavHeader(Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] || 24000)))
      }
      const bytes = Buffer.concat([carry, Buffer.from(audio.data, 'base64')])
      const even = bytes.length - (bytes.length % 2)
      carry = bytes.subarray(even)
      res.write(amplified(bytes.subarray(0, even)))
    }
    if (!started) throw new Error('Sem áudio.')
    res.end()
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    if (started) return void res.destroy()
    res.writeHead(error.status === 429 ? 429 : 502, cors)
    res.end('Não foi possível gerar a voz neural.')
  }
}

export async function handleSpeech(req, res, cors) {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    if (!process.env.GEMINI_API_KEY) { res.writeHead(503, cors); return res.end('Voz neural não configurada.') }
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 16000) { res.writeHead(400, cors); return res.end('Texto muito longo.') }
    }
    let request
    try { request = JSON.parse(body) } catch { res.writeHead(400, cors); return res.end('Pedido inválido.') }
    const text = typeof request.text === 'string' ? request.text.trim() : ''
    if (!text || text.length > 4000) { res.writeHead(400, cors); return res.end('Texto inválido.') }
    const voice = selectGeminiVoice(request.voice)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await withSpeechModel((model) => ai.models.generateContent({
      model,
      contents: speechPrompt(text),
      config: { responseModalities: ['AUDIO'], abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }))
    const audio = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
    if (!audio?.data || !PCM.test(audio.mimeType || '')) throw new Error('Sem áudio.')
    const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] || 24000)
    const wav = pcmToWav(Buffer.from(audio.data, 'base64'), rate)
    res.writeHead(200, { ...cors, 'content-type': 'audio/wav', 'cache-control': 'no-store', 'content-length': wav.length })
    res.end(wav)
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(error.status === 429 ? 429 : 502, cors)
    res.end('Não foi possível gerar a voz neural. Use a voz do navegador temporariamente.')
  }
}
