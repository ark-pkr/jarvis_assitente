import test from 'node:test'
import assert from 'node:assert/strict'
import { geminiQuery } from './gemini.mjs'
import { uiServer } from './ui.mjs'
import { displayServer } from './panels.mjs'
import { visionServer } from './vision.mjs'
import { chromeServer } from './browser.mjs'
import { personalRecords } from './turn-context.mjs'

async function* messages(...texts) {
  for (const content of texts) yield { message: { content } }
}
function fakeAI(respond) {
  return { models: { generateContentStream: async (request) => respond(request) } }
}
async function* chunks(...parts) {
  for (const part of parts) yield { candidates: [{ content: { parts: [part] } }] }
}
const defaults = { model: 'test', systemPrompt: 'JARVIS', maxTurns: 3,
  canUseTool: async () => ({ behavior: 'allow' }) }

test('connects actual internal MCP servers, runs UI tool, preserves signature and history', async () => {
  const effects = []
  let calls = 0
  const ai = fakeAI((request) => {
    calls++
    if (calls === 1) {
      const reset = request.config.tools[0].functionDeclarations.find((t) => t.description.startsWith('mcp__jarvis_ui__ui_reset:'))
      assert.ok(reset)
      return chunks({ functionCall: { name: reset.name, args: {} }, thoughtSignature: 'signature' })
    }
    if (calls === 2) {
      assert.equal(request.contents[1].parts[0].thoughtSignature, 'signature')
      assert.equal(request.contents[2].parts[0].functionResponse.response.isError, false)
      return chunks({ text: 'Pronto.' })
    }
    assert.equal(request.contents[0].parts[0].text, 'Mude a interface')
    assert.equal(request.contents.at(-1).parts[0].text, 'Obrigado')
    return chunks({ text: 'Disponha.' })
  })
  const session = geminiQuery({ prompt: messages('Mude a interface', 'Obrigado'), options: {
    ...defaults, mcpServers: {
      jarvis_ui: uiServer((op) => effects.push(op)),
      jarvis: displayServer(() => {}, () => {}),
      jarvis_eyes: visionServer(async () => ({ error: 'camera off' })),
      jarvis_chrome: chromeServer({ allowWrites: false }),
    },
  } }, { ai })
  const events = []
  for await (const event of session) events.push(event)
  assert.equal(events[0].mcp_servers.filter((s) => s.status === 'connected').length, 4)
  assert.deepEqual(effects, ['reset'])
  assert.deepEqual(events.filter((e) => e.type === 'result').map((e) => e.result), ['Pronto.', 'Disponha.'])
})

test('HELIOS voice controls emit palette and pause commands', async () => {
  const actions = []
  let call = 0
  const ai = fakeAI((request) => {
    call++
    if (call === 1 || call === 3) {
      const helios = request.config.tools[0].functionDeclarations.find((tool) => tool.description.startsWith('mcp__jarvis_ui__ui_helios:'))
      assert.ok(helios)
      return chunks({ functionCall: { name: helios.name, args: call === 1
        ? { action: 'color', value: 'blue' }
        : { action: 'pause' } } })
    }
    if (call === 2 || call === 4) return chunks({ text: 'HELIOS atualizado.' })
    return chunks({ text: 'HELIOS atualizado.' })
  })
  const session = geminiQuery({ prompt: messages('Mude para azul', 'Pause o reator'), options: {
    ...defaults, mcpServers: { jarvis_ui: uiServer((op, args) => actions.push({ op, args })) },
  } }, { ai })
  for await (const _event of session) { /* consume events */ }
  assert.deepEqual(actions, [
    { op: 'helios', args: { action: 'color', value: 'blue' } },
    { op: 'helios', args: { action: 'pause', value: true } },
  ])
})

test('denied tools are excluded; API failure is recoverable without leaking details', async () => {
  let requests = 0
  const ai = fakeAI((request) => {
    assert.equal(request.config.tools, undefined)
    if (++requests === 1) throw Object.assign(new Error('secret upstream detail'), { status: 429 })
    assert.equal(request.contents.length, 1)
    return chunks({ text: 'Recuperado.' })
  })
  const session = geminiQuery({ prompt: messages('Primeira', 'Segunda'), options: {
    ...defaults, canUseTool: async () => ({ behavior: 'deny' }),
    mcpServers: { jarvis_ui: uiServer(() => assert.fail('denied tool ran')) },
  } }, { ai })
  const results = []
  for await (const event of session) if (event.type === 'result') results.push(event)
  assert.match(results[0].errors[0], /limite de uso/)
  assert.doesNotMatch(JSON.stringify(results), /secret upstream/)
  assert.equal(results[1].result, 'Recuperado.')
})

test('interrupt aborts old stream and next question uses clean history', async () => {
  let requests = 0
  let session
  const ai = fakeAI((request) => {
    if (++requests === 1) return (async function* () {
      yield { candidates: [{ content: { parts: [{ text: 'Antiga.' }] } }] }
      assert.equal(request.config.abortSignal.aborted, true)
      request.config.abortSignal.throwIfAborted()
    })()
    assert.equal(request.contents.length, 1)
    return chunks({ text: 'Nova.' })
  })
  session = geminiQuery({ prompt: messages('Velha', 'Nova'), options: defaults }, { ai })
  const results = []
  for await (const event of session) {
    if (event.type === 'stream_event' && event.event.delta?.text === 'Antiga.') session.interrupt()
    if (event.type === 'result') results.push(event.result)
  }
  assert.deepEqual(results, ['', 'Nova.'])
})

test('permission is checked again before executing a tool', async () => {
  let phase = 0
  const ai = fakeAI((request) => {
    if (phase++ === 0) {
      const reset = request.config.tools[0].functionDeclarations.find((t) => t.description.startsWith('mcp__jarvis_ui__ui_reset:'))
      return chunks({ functionCall: { name: reset.name, args: {} } })
    }
    assert.equal(request.contents.at(-1).parts[0].functionResponse.response.isError, true)
    return chunks({ text: 'Bloqueado.' })
  })
  const session = geminiQuery({ prompt: messages('reset'), options: {
    ...defaults, canUseTool: async () => ({ behavior: phase === 0 ? 'allow' : 'deny' }),
    mcpServers: { jarvis_ui: uiServer(() => assert.fail('denied tool executed')) },
  } }, { ai })
  const results = []
  for await (const event of session) if (event.type === 'result') results.push(event.result)
  assert.deepEqual(results, ['Bloqueado.'])
})

test('restores selected conversation and memory without leaking another session', async () => {
  let step = 0
  const ai = fakeAI((request) => {
    if (step++ === 0) {
      assert.equal(request.contents[0].parts[0].text, 'Mensagem antiga')
      assert.match(request.config.systemInstruction, /Prefiro respostas curtas/)
      assert.match(request.config.systemInstruction, /Use somente português do Brasil/)
      assert.equal(request.config.thinkingConfig.thinkingLevel, 'LOW')
    } else {
      assert.equal(request.contents.length, 1)
      assert.equal(request.contents[0].parts[0].text, 'Nova conversa')
    }
    return chunks({ text: 'Entendido.' })
  })
  async function* input() {
    yield { message: { content: 'Continue', context: [{ role: 'user', text: 'Mensagem antiga' }], memory: 'Prefiro respostas curtas', fast: true } }
    yield { message: { content: 'Nova conversa', context: [], memory: '' } }
  }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, model: 'gemini-3.5-flash' } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.subtype, 'success')
  assert.equal(step, 2)
})

test('detailed mode explicitly requests high reasoning and its response guidance', async () => {
  const ai = fakeAI((request) => {
    assert.equal(request.config.thinkingConfig.thinkingLevel, 'HIGH')
    assert.match(request.config.systemInstruction, /Ritmo desta resposta: detalhado/)
    return chunks({ text: 'Resposta com explicação.' })
  })
  async function* input() { yield { message: { content: 'Explique', fast: false } } }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, model: 'gemini-3.5-flash' } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.subtype, 'success')
})

test('article mode asks for research, sources, a readable blade and detailed reasoning', async () => {
  const ai = fakeAI((request) => {
    assert.equal(request.config.thinkingConfig.thinkingLevel, 'HIGH')
    assert.match(request.config.systemInstruction, /Pedido de artigo/)
    assert.match(request.config.systemInstruction, /links exatos/)
    assert.match(request.config.systemInstruction, /ferramenta blade/)
    return chunks({ text: 'Artigo pronto.' })
  })
  async function* input() { yield { message: { content: 'Escreva um artigo sobre energia solar', fast: false, article: true } } }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, model: 'gemini-3.5-flash' } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.subtype, 'success')
})

test('privacy mode sends neither memory nor history to the model', async () => {
  const ai = fakeAI((request) => {
    assert.match(request.config.systemInstruction, /Modo privacidade/)
    assert.match(request.config.systemInstruction, /não pesquise na web/)
    assert.doesNotMatch(request.config.systemInstruction, /Registros pessoais/)
    assert.equal(request.contents.length, 1)
    return chunks({ text: 'Sem memória nem pesquisa.' })
  })
  async function* input() {
    yield { message: { content: 'Responda', fast: true, privacyMode: true, memory: 'Registros pessoais: segredo',
      context: [{ role: 'user', text: 'Conversa anterior' }] } }
  }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, model: 'gemini-3.5-flash' } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.subtype, 'success')
})

test('personal records never join a private turn, and are never read for one', async () => {
  let reads = 0
  const read = async () => { reads++; return { entries: [{ id: '1', kind: 'perfil', title: 'Nome', notes: 'segredo', next: '', status: '' }] } }
  assert.equal(await personalRecords(true, read), '')
  assert.equal(reads, 0)
  assert.match(await personalRecords(false, read), /segredo/)
  assert.equal(await personalRecords(false, async () => { throw new Error('indisponível') }), '')
})
