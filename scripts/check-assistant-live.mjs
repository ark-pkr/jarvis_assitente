import WebSocket from 'ws'
import assert from 'node:assert/strict'
const socket = new WebSocket('ws://localhost:8787', { origin: 'http://localhost:5173' })
let called = false
const timer = setTimeout(() => { console.error('Tempo excedido no teste do assistente.'); socket.terminate(); process.exitCode = 1 }, 60000)
socket.on('open', () => socket.send(JSON.stringify({ type: 'ask', id: 'assistant-live-check', text: 'Use computer_summary para medir este computador e informe brevemente a memória usada e espaço livre em português. Não use outras ferramentas nem salve registros.', fast: true })))
socket.on('message', (raw) => {
  const frame = JSON.parse(raw)
  if (frame.type === 'tool' && frame.name.includes('computer_summary')) called = true
  if (frame.type === 'approval') socket.send(JSON.stringify({ type: 'reply', id: frame.id, approved: false }))
  if (frame.type === 'error') { console.error(frame.message); process.exitCode = 1; clearTimeout(timer); socket.close() }
  if (frame.type === 'done') {
    try { assert.ok(called, 'Gemini deve chamar a ferramenta real de diagnóstico'); assert.ok(frame.text.length > 5); console.log('Gemini chamou computer_summary e respondeu com medições reais.') }
    catch (error) { console.error(error.message); process.exitCode = 1 }
    clearTimeout(timer); socket.close()
  }
})
socket.on('error', (error) => { console.error(error.message); clearTimeout(timer); process.exitCode = 1 })
