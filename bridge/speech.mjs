import { GoogleGenAI } from '@google/genai'
import { voiceCache, worthKeeping } from './voice-cache.mjs'

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
/** Asking a spent model again costs every sentence a wait before the spare is tried. */
const SPENT_FOR_MS = 30 * 60000
/** Past this, the system voice saying it now beats a better voice saying it late. */
const FIRST_AUDIO_MS = 10000
let spentUntil = 0
let spareSpentUntil = 0
const usage = { since: Date.now(), generated: {}, remembered: 0 }
/** For the diagnostic report: this quota is counted by Google, so these are only what this run saw. */
export const speechStatus = () => ({ ...usage, generated: { ...usage.generated }, mainSpent: Date.now() < spentUntil, spareSpent: Date.now() < spareSpentUntil })

async function askModel(request, model) {
  const result = await request(model)
  usage.generated[model] = (usage.generated[model] ?? 0) + 1
  return result
}
async function askSpare(request, now) {
  try { return await askModel(request, SPARE_SPEECH_MODEL) } catch (error) {
    if (error.status === 429) {
      console.warn(`[jarvis] voz: cota de ${SPARE_SPEECH_MODEL} esgotada; usando a voz do sistema`)
      spareSpentUntil = now() + SPENT_FOR_MS
    }
    throw error
  }
}
async function withSpeechModel(request, now = Date.now) {
  if (now() < spentUntil) {
    if (now() < spareSpentUntil) throw Object.assign(new Error('Cotas de voz esgotadas.'), { status: 429 })
    return askSpare(request, now)
  }
  try { return await askModel(request, speechModel()) } catch (error) {
    if (error.status !== 429 || speechModel() === SPARE_SPEECH_MODEL) throw error
    console.warn(`[jarvis] voz: cota de ${speechModel()} esgotada; usando ${SPARE_SPEECH_MODEL}`)
    spentUntil = now() + SPENT_FOR_MS
    return askSpare(request, now)
  }
}
/** How a sentence should feel. An unknown tone is no tone: this is decoration, never a failure. */
export const TONES = {
  animado: 'Soe animado e contente, com um sorriso na voz.',
  calmo: 'Soe calmo e tranquilo, sem pressa.',
  serio: 'Soe sério e atento, sem dramatizar.',
  carinhoso: 'Soe acolhedor e gentil, com a voz suave e mais devagar.',
  baixo: 'Fale baixo e suave, como quem conversa à noite com alguém ao lado.',
}
export const speechPrompt = (text, tone) => `Leia apenas o texto a seguir em português do Brasil, com fala direta, fluida e natural, como numa conversa entre amigos. Use ritmo de conversa ligeiramente acelerado, articulando com clareza. Conecte as frases e use pausas muito curtas, somente onde a pontuação for necessária à compreensão. Não fale pausadamente, não faça pausas dramáticas nem alongue palavras. ${Object.hasOwn(TONES, tone ?? '') ? `${TONES[tone]} ` : ''}Não acrescente palavras nem leia esta orientação.\n\n${text}`

/**
 * What each model is sent. The spare one takes a long instruction as a reason to stretch
 * a sentence to twenty seconds, and rejects a system instruction, but it understands
 * a tag in brackets and does not say it.
 */
const SPARE_TAGS = { animado: 'excited', calmo: 'calm', serio: 'serious', carinhoso: 'gentle', baixo: 'whispers' }
export const speechRequest = (model, text, tone) => model !== SPARE_SPEECH_MODEL ? speechPrompt(text, tone)
  : Object.hasOwn(SPARE_TAGS, tone ?? '') ? `[${SPARE_TAGS[tone]}] ${text}` : text

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
export async function handleSpeechStream(req, res, cors, ai, { cache = ai ? null : voiceCache, firstAudioMs = FIRST_AUDIO_MS } = {}) {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  let started = false
  let slow
  const begun = Date.now()
  const audioHeaders = { ...cors, 'content-type': 'audio/wav', 'cache-control': 'no-store', 'accept-ranges': 'none' }
  try {
    const query = new URL(req.url, 'http://localhost').searchParams
    const text = query.get('text')?.trim() ?? ''
    if (!text || text.length > 4000) { res.writeHead(400, cors); return res.end('Texto inválido.') }
    const voice = selectGeminiVoice(query.get('voice'))
    const tone = Object.hasOwn(TONES, query.get('tone') ?? '') ? query.get('tone') : ''
    // Asked before the key or the network, because a sentence already said needs neither.
    if (cache && worthKeeping(text)) {
      // Either model's take: which one is spent is not known yet after a restart, or offline.
      const remembered = await cache.find([speechModel(), SPARE_SPEECH_MODEL].map((model) => cache.key(model, voice, tone, text)))
      if (remembered) {
        usage.remembered++
        res.writeHead(200, audioHeaders)
        return res.end(remembered)
      }
    }
    if (!process.env.GEMINI_API_KEY && !ai) { res.writeHead(503, cors); return res.end('Voz neural não configurada.') }
    const client = ai ?? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    slow = setTimeout(() => controller.abort(), firstAudioMs)
    let used = ''
    const stream = await withSpeechModel((model) => {
      used = model
      return client.models.generateContentStream({
        model, contents: speechRequest(model, text, tone),
        config: { responseModalities: ['AUDIO'], abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      })
    })
    const kept = cache && worthKeeping(text) ? [] : null
    // Chunks can split a 16-bit sample, and a stray byte turns the rest to noise.
    let carry = Buffer.alloc(0)
    for await (const chunk of stream) {
      const audio = chunk.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
      if (!audio?.data) continue
      if (!PCM.test(audio.mimeType || '')) throw new Error('Formato de áudio inesperado.')
      if (!started) {
        started = true
        clearTimeout(slow)
        console.log(`[jarvis] voz: primeiro áudio em ${Date.now() - begun} ms`)
        res.writeHead(200, audioHeaders)
        const header = streamingWavHeader(Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] || 24000))
        res.write(header)
        kept?.push(header)
      }
      const bytes = Buffer.concat([carry, Buffer.from(audio.data, 'base64')])
      const even = bytes.length - (bytes.length % 2)
      carry = bytes.subarray(even)
      const loud = amplified(bytes.subarray(0, even))
      res.write(loud)
      kept?.push(loud)
    }
    if (!started) throw new Error('Sem áudio.')
    res.end()
    // A sentence cut short by an interruption must not come back cut short forever.
    if (kept && !controller.signal.aborted) void cache.put(cache.key(used, voice, tone, text), Buffer.concat(kept)).catch((error) => console.warn('[jarvis] voz: cache:', error.message))
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    if (started) return void res.destroy()
    res.writeHead(error.status === 429 ? 429 : 502, cors)
    res.end('Não foi possível gerar a voz neural.')
  } finally { clearTimeout(slow) }
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
      contents: speechRequest(model, text, request.tone),
      config: { responseModalities: ['AUDIO'], abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }))
    const audio = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
    if (!audio?.data || !/pcm|l16|wav/i.test(audio.mimeType || '')) throw new Error('Sem áudio.')
    // Whole answers from the spare model already come as WAV.
    const bytes = Buffer.from(audio.data, 'base64')
    const wav = /wav/i.test(audio.mimeType) ? bytes : pcmToWav(bytes, Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] || 24000))
    res.writeHead(200, { ...cors, 'content-type': 'audio/wav', 'cache-control': 'no-store', 'content-length': wav.length })
    res.end(wav)
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(error.status === 429 ? 429 : 502, cors)
    res.end('Não foi possível gerar a voz neural. Use a voz do navegador temporariamente.')
  }
}
