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
    const response = await ai.models.generateContent({
      model: process.env.JARVIS_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
      contents: `Leia apenas o texto a seguir em português do Brasil, com fala direta, fluida e natural. Use ritmo de conversa ligeiramente acelerado, articulando com clareza. Conecte as frases e use pausas muito curtas, somente onde a pontuação for necessária à compreensão. Não fale pausadamente, não faça pausas dramáticas nem alongue palavras. Não acrescente palavras nem leia esta orientação.\n\n${text}`,
      config: { responseModalities: ['AUDIO'], abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    })
    const audio = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
    if (!audio?.data || !/pcm/i.test(audio.mimeType || '')) throw new Error('Sem áudio.')
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
