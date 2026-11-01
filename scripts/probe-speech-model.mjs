import '../bridge/env.mjs'
import { GoogleGenAI } from '@google/genai'
import { promises as fs } from 'node:fs'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
try {
  const bytes = await fs.readFile('.ui-check.local/word-command.wav')
  const result = await ai.interactions.create({ model: 'gemini-3.5-transcribe', store: false, input: [{ type: 'audio', data: bytes.toString('base64'), mime_type: 'audio/wav' }], generation_config: { transcription_config: { language_codes: ['pt-BR'], custom_vocabulary: ['Jarvis', 'Microsoft Word', 'Excel', 'Visual Studio Code'] } } })
  console.log(JSON.stringify({ output_text: result.output_text, outputs: result.outputs?.map((part) => ({ type: part.type, text: part.text })) }).slice(0, 1200))
} catch (error) { console.error(String(error.message).replaceAll(process.env.GEMINI_API_KEY || 'not-configured', '[redigido]').slice(0, 1200)); process.exitCode = 1 }
