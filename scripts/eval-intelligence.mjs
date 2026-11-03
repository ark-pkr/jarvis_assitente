/**
 * A score for how well he answers, against the real model.
 *
 *   npm run test:intelligence -- antes
 *   npm run test:intelligence -- depois        (compares with the last saved run)
 *   npm run test:intelligence -- depois nome   (only the cases named)
 *
 * Runs its own bridge on throwaway data, and refuses every approval, so nothing
 * here touches this computer's records or apps. Each run costs model calls.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WebSocket } from 'ws'
import { CASES } from './eval-cases.mjs'
import { chooseResponsePace } from '../src/lib/responsePace.ts'

const PORT = 18797
const [label = 'atual', ...only] = process.argv.slice(2)
const results = path.resolve('.ui-check.local/eval')
const ORIGIN = 'http://localhost:5173'
const TURN_MS = 60000

function startBridge(data) {
  const env = { ...process.env, JARVIS_BRIDGE_PORT: String(PORT), JARVIS_DATA_DIR: data, JARVIS_ALLOWED_ORIGINS: ORIGIN, ELEVENLABS_API_KEY: '', JARVIS_NO_CHROME: '1' }
  const child = spawn(process.execPath, ['bridge/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr.on('data', () => {}); child.stdout.on('data', () => {})
  return child
}

async function waitFor(check, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) { try { if (await check()) return } catch { /* Not up yet. */ } await new Promise((resolve) => setTimeout(resolve, 250)) }
  throw new Error('O serviço não respondeu.')
}

/** The interface, in as few lines as it can be. */
function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { origin: ORIGIN })
    let turn = null
    let opened = false
    const client = {
      close: () => new Promise((done) => { socket.once('close', done); socket.close() }),
      ask(text, context) {
        return new Promise((finish) => {
          const id = `e${Date.now()}`
          const timer = setTimeout(() => { turn = null; finish({ text: '', tools: [], error: 'tempo esgotado' }) }, TURN_MS)
          turn = { tools: [], finish: (result) => { clearTimeout(timer); turn = null; finish(result) } }
          const pace = chooseResponsePace(text)
          socket.send(JSON.stringify({ type: 'ask', id, text, context, memory: '', fast: pace.fast, article: false, privacyMode: false, mode: 'assistente' }))
        })
      },
    }
    socket.on('error', reject)
    socket.on('message', (raw) => {
      const frame = JSON.parse(String(raw))
      if (frame.type === 'ready' && !opened) { opened = true; resolve(client) }
      if (frame.type === 'approval') socket.send(JSON.stringify({ type: 'reply', id: frame.id, approved: false }))
      else if (frame.type === 'memory') socket.send(JSON.stringify({ type: 'reply', id: frame.id, saved: true }))
      else if (frame.type === 'capture') socket.send(JSON.stringify({ type: 'reply', id: frame.id, error: 'sem câmera neste teste' }))
      if (!turn) return
      if (frame.type === 'tool') turn.tools.push(frame.name)
      if (frame.type === 'done') turn.finish({ text: frame.text ?? '', tools: turn.tools })
      if (frame.type === 'error') turn.finish({ text: '', tools: turn.tools, error: frame.message })
    })
  })
}

function grade(item, { text, tools, error }) {
  const faults = []
  const used = tools.join(' ')
  if (error) faults.push(error)
  if (item.tool && !item.tool.test(used)) faults.push(`não usou ${item.tool.source}`)
  if (item.noTool && item.noTool.test(used.replace(/mcp__jarvis(_ui)?__\S+/g, ''))) faults.push(`usou ${used}`)
  if (item.says && !item.says.test(text)) faults.push(`faltou ${item.says.source}`)
  if (item.notSays && item.notSays.test(text)) faults.push(`disse ${item.notSays.source}`)
  const words = text.split(/\s+/).filter(Boolean).length
  if (item.maxWords && words > item.maxWords) faults.push(`${words} palavras`)
  if (item.noMarkup && /\*\*|^#|^\s*[-*] /m.test(text)) faults.push('marcação lida em voz alta')
  return faults
}

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-eval-'))
const bridge = startBridge(data)
const report = []
try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/health`)).status < 500)
  let client = await connect()
  for (const item of CASES.filter((entry) => !only.length || only.includes(entry.id))) {
    let context = []
    let last = { text: '', tools: [] }
    const began = Date.now()
    for (const step of item.steps) {
      if (step.newChat) { context = []; await client.close(); client = await connect() }
      last = await client.ask(step.text, context)
      context = [...context, { role: 'user', text: step.text }, { role: 'jarvis', text: last.text }]
      if (step.endChat) { await client.close(); client = await connect() }
      if (step.settle) await new Promise((resolve) => setTimeout(resolve, step.settle))
    }
    const faults = grade(item, last)
    report.push({ id: item.id, area: item.area, passed: !faults.length, faults, ms: Date.now() - began, tools: last.tools, text: last.text.slice(0, 400) })
    console.log(`${faults.length ? 'FALHOU' : 'ok    '} ${item.area.padEnd(13)} ${item.id.padEnd(20)} ${((Date.now() - began) / 1000).toFixed(1).padStart(5)} s ${faults.join('; ').slice(0, 110)}`)
    if (faults.length) console.log(`       disse: ${last.text.replace(/\s+/g, ' ').slice(0, 200) || '(nada)'}`)
  }
  await client.close()
} finally {
  bridge.kill()
  await new Promise((resolve) => setTimeout(resolve, 400))
  await fs.rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {})
}

const passed = report.filter((entry) => entry.passed).length
const areas = [...new Set(report.map((entry) => entry.area))].map((area) => {
  const own = report.filter((entry) => entry.area === area)
  return `${area} ${own.filter((entry) => entry.passed).length}/${own.length}`
})
console.log(`\n${label}: ${passed}/${report.length} | ${areas.join(' | ')}`)
await fs.mkdir(results, { recursive: true })
const previous = (await fs.readdir(results).catch(() => [])).sort().at(-1)
if (previous && !only.length) {
  const before = JSON.parse(await fs.readFile(path.join(results, previous), 'utf8'))
  const was = new Map(before.report.map((entry) => [entry.id, entry.passed]))
  const change = (from, to) => report.filter((entry) => was.get(entry.id) === from && entry.passed === to).map((entry) => entry.id)
  console.log(`contra ${before.label}: ${before.passed}/${before.report.length} antes. Melhorou: ${change(false, true).join(', ') || 'nada'}. Piorou: ${change(true, false).join(', ') || 'nada'}.`)
}
if (!only.length) await fs.writeFile(path.join(results, `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${label}.json`), JSON.stringify({ label, passed, report }, null, 2))
