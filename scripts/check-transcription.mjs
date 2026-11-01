import '../bridge/env.mjs'
import { promises as fs } from 'node:fs'
import { transcribeAudio } from '../bridge/transcribe.mjs'
const file = '.ui-check.local/transcription-check.wav'
let bytes
try { bytes = await fs.readFile(file) } catch {
  const response = await fetch('http://localhost:8787/voice', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Olá, estou pronto para ajudar nos seus estudos.', voice: 'Charon' }) })
  if (!response.ok) throw new Error(`Falha ao criar áudio: ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer()); await fs.writeFile(file, bytes)
}
try { console.log('Transcrição:', await transcribeAudio(bytes, 'audio/wav')) }
catch (error) { console.error('Falha:', error.status, String(error.message).replaceAll(process.env.GEMINI_API_KEY || 'not-configured', '[redigido]').slice(0, 1200)); process.exitCode = 1 }
