import test from 'node:test'
import assert from 'node:assert/strict'
import { OPEN_TOOLS, routeTools } from './tool-routing.mjs'
import { geminiQuery, localNow } from './gemini.mjs'
import { uiServer } from './ui.mjs'
import { dailyServer } from './daily.mjs'

const quick = (content, extra) => routeTools({ content, fast: true, mode: 'assistente', ...extra })

test('a general question carries no tools at all', () => {
  assert.equal(quick('Qual é a capital da Austrália?').size, 0)
})

test('each request carries what its words call for', () => {
  assert.ok(quick('Como está o clima em Balsas?').has('jarvis_daily'))
  assert.ok(quick('Pausa a música').has('jarvis_daily'))
  assert.equal(quick('Que horas são?').size, 0, 'the clock comes with every request')
  assert.ok(quick('Lembre-me de ligar amanhã').has('jarvis_assistant'))
  assert.ok(quick('Olha minha tela').has('jarvis_eyes'))
  assert.ok(quick('Abra o VS Code').has('jarvis_desktop'))
  assert.ok(quick('Deixe a interface azul').has('jarvis_ui'))
  assert.ok(quick('Pesquise o preço do dólar').has('jarvis_chrome'))
})

test('saying the computer does not drag in its tools when the volume is what was asked', () => {
  assert.deepEqual([...quick('Qual é o volume do computador?')], ['jarvis_daily'])
  assert.ok(quick('O computador está lento').has('jarvis_assistant'))
})

test('a bare follow-up keeps the tools of the conversation it belongs to', () => {
  assert.ok(quick('Sim, pode', { context: [{ role: 'user', text: 'Crie um lembrete' }] }).has('jarvis_assistant'))
})

test('a request with its own topic leaves the old topic behind', () => {
  const routed = quick('Como está o clima em Balsas?', { context: [{ role: 'user', text: 'Pesquise notícias de hoje' }] })
  assert.ok(routed.has('jarvis_daily'))
  assert.ok(!routed.has('jarvis_chrome'))
})

test('a full sentence with no topic stays general, whatever was said before', () => {
  assert.equal(quick('Qual é a capital do Chile, por favor me diga', { context: [{ role: 'user', text: 'Crie um lembrete' }] }).size, 0)
})

test('depth, articles and the other modes keep every tool', () => {
  assert.equal(routeTools({ content: 'Oi', fast: false, mode: 'assistente' }), null)
  assert.equal(routeTools({ content: 'Oi', fast: true, article: true, mode: 'assistente' }), null)
  assert.equal(routeTools({ content: 'Oi', fast: true, mode: 'desenvolvimento' }), null)
  assert.equal(routeTools({ content: 'Oi', fast: true, mode: 'tutor' }), null)
})

async function* ask(content, extra = {}) {
  yield { message: { content, fast: true, mode: 'assistente', ...extra } }
}
async function* chunks(...parts) {
  for (const part of parts) yield { candidates: [{ content: { parts: [part] } }] }
}
const options = {
  model: 'principal', lightModel: 'leve', systemPrompt: 'JARVIS', maxTurns: 4, routeTools: true,
  canUseTool: async () => ({ behavior: 'allow' }),
  mcpServers: { jarvis_ui: uiServer(() => {}), jarvis_daily: dailyServer({ run: async () => ({ volume: 50, muted: false }) }) },
}
const names = (request) => (request.config.tools?.[0].functionDeclarations ?? []).map((tool) => tool.description.split(':')[0] === tool.description ? tool.name : tool.description.split(':')[0])
const run = async (prompt, respond) => {
  const requests = []
  const ai = { models: { generateContentStream: async (request) => { requests.push(request); return respond(request, requests.length) } } }
  const events = []
  for await (const event of geminiQuery({ prompt, options }, { ai })) events.push(event)
  return { requests, events }
}

test('a general question goes to the light model with only the way out declared', async () => {
  const { requests } = await run(ask('Qual é a capital do Chile?'), () => chunks({ text: 'Santiago.' }))
  assert.equal(requests[0].model, 'leve')
  assert.deepEqual(names(requests[0]), [OPEN_TOOLS])
  assert.match(requests[0].config.systemInstruction, /abrir_ferramentas/)
})

test('a request with a topic declares that server and nothing unrelated', async () => {
  const { requests } = await run(ask('Qual é o volume?'), () => chunks({ text: 'Cinquenta.' }))
  assert.equal(requests[0].model, 'leve')
  const declared = names(requests[0])
  assert.ok(declared.includes('mcp__jarvis_daily__volume'))
  assert.ok(!declared.some((name) => name.startsWith('mcp__jarvis_ui__')))
})

test('when the words miss, one call brings every tool in and the main model back', async () => {
  const { requests, events } = await run(ask('Faça aquilo de sempre'), (request, step) => step === 1
    ? chunks({ functionCall: { name: OPEN_TOOLS, args: {} } })
    : chunks({ text: 'Tudo certo.' }))
  assert.equal(requests.length, 2)
  assert.equal(requests[1].model, 'principal')
  const declared = names(requests[1])
  assert.ok(declared.includes('mcp__jarvis_ui__ui_reset'))
  assert.ok(declared.includes('mcp__jarvis_daily__volume'))
  assert.ok(!declared.includes(OPEN_TOOLS))
  assert.doesNotMatch(requests[1].config.systemInstruction, /Só parte das ferramentas/)
  assert.equal(events.filter((event) => event.type === 'stream_event' && event.event.content_block).length, 0, 'not shown as work')
  assert.equal(events.at(-1).result, 'Tudo certo.')
})

test('a missing light model falls back to the main one instead of failing', async () => {
  const { requests, events } = await run(ask('Qual é a capital do Peru?'), (request, step) => {
    if (step === 1) throw Object.assign(new Error('not found'), { status: 404 })
    return chunks({ text: 'Lima.' })
  })
  assert.equal(requests[1].model, 'principal')
  assert.equal(events.at(-1).result, 'Lima.')
})

test('every request knows the date and time, in Brasília', async () => {
  const { requests } = await run(ask('Que horas são?'), () => chunks({ text: 'Três horas.' }))
  assert.match(requests[0].config.systemInstruction, /horário de Brasília/)
  assert.match(localNow(new Date('2026-11-01T18:00:00Z')), /15:00/)
})

test('without routing, every tool still goes out as before', async () => {
  const requests = []
  const ai = { models: { generateContentStream: async (request) => { requests.push(request); return chunks({ text: 'Oi.' }) } } }
  for await (const event of geminiQuery({ prompt: ask('Oi'), options: { ...options, routeTools: false } }, { ai })) void event
  assert.equal(requests[0].model, 'principal')
  assert.ok(names(requests[0]).includes('mcp__jarvis_ui__ui_reset'))
  assert.ok(!names(requests[0]).includes(OPEN_TOOLS))
})
