import test from 'node:test'
import assert from 'node:assert/strict'
import { claimsAction, geminiQuery } from './gemini.mjs'
import { uiServer } from './ui.mjs'
import { displayServer } from './panels.mjs'
import { visionServer } from './vision.mjs'
import { chromeServer } from './browser.mjs'
import { personalRecords } from './turn-context.mjs'
import { turnCost } from './metrics.mjs'
import { createServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

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

test('a tool called by the name the prompt uses still runs, and a refused one stays refused', async () => {
  for (const [allowed, wanted] of [[true, false], [false, true]]) {
    const seen = []
    let calls = 0
    const ai = fakeAI((request) => {
      if (++calls === 1) return chunks({ functionCall: { name: 'ui_reset', args: {} } })
      seen.push(request.contents.at(-1).parts[0].functionResponse.response.isError)
      return chunks({ text: 'Tudo certo.' })
    })
    const effects = []
    const session = geminiQuery({ prompt: messages('Volte ao normal'), options: { ...defaults,
      canUseTool: async () => ({ behavior: allowed ? 'allow' : 'deny' }),
      mcpServers: { jarvis_ui: uiServer((op) => effects.push(op)) } } }, { ai })
    for await (const _ of session) { /* drained */ }
    assert.deepEqual(seen, [wanted])
    assert.equal(effects.length, allowed ? 1 : 0)
  }
})

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

test('a slow external server never holds up the first answer', async () => {
  const silent = createServer(() => { /* Accepts the request and never replies. */ })
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve))
  const started = Date.now()
  let session
  const ai = fakeAI(() => chunks({ text: 'Pronto.' }))
  session = geminiQuery({ prompt: messages('Oi'), options: { ...defaults,
    mcpServers: { lento: { url: `http://127.0.0.1:${silent.address().port}/mcp` } } } }, { ai })
  try {
    for await (const event of session) {
      if (event.type === 'system') assert.deepEqual(event.mcp_servers, [{ name: 'lento', status: 'pending' }])
      if (event.type === 'result') { assert.equal(event.result, 'Pronto.'); break }
    }
    assert.ok(Date.now() - started < 3000)
  } finally {
    session.close()
    silent.closeAllConnections()
    silent.close()
  }
})

test('reports usage for the whole turn, across tool steps', async () => {
  let step = 0
  const ai = fakeAI((request) => (async function* () {
    if (step++ === 0) {
      const reset = request.config.tools[0].functionDeclarations.find((t) => t.description.startsWith('mcp__jarvis_ui__ui_reset:'))
      yield { candidates: [{ content: { parts: [{ functionCall: { name: reset.name, args: {} } }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 5, thoughtsTokenCount: 7, cachedContentTokenCount: 40 } }
    } else {
      yield { candidates: [{ content: { parts: [{ text: 'Feito.' }] } }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 9 } }
    }
  })())
  const session = geminiQuery({ prompt: messages('Reinicie'), options: { ...defaults,
    mcpServers: { jarvis_ui: uiServer(() => {}) } } }, { ai })
  let result
  for await (const event of session) if (event.type === 'result') result = event
  assert.equal(result.usage.inputTokens, 220)
  assert.equal(result.usage.cachedTokens, 40)
  assert.equal(result.usage.outputTokens, 14)
  assert.equal(result.usage.thoughtTokens, 7)
  assert.ok(result.usage.firstTextMs >= 0)
  assert.equal(result.total_cost_usd, null)
  assert.equal(turnCost(result.usage, { JARVIS_PRICE_INPUT: '1', JARVIS_PRICE_OUTPUT: '2' }), (220 + 2 * 21) / 1_000_000)
})

test('tool results follow the conversation, and stay inside it', async () => {
  const instructions = []
  let step = 0
  const ai = fakeAI((request) => {
    instructions.push(request.config.systemInstruction)
    if (step++ === 0) {
      const tool = request.config.tools[0].functionDeclarations[0]
      return chunks({ functionCall: { name: tool.name, args: {} } })
    }
    return chunks({ text: step === 2 ? 'Resposta um.' : 'Ok.' })
  })
  const found = { type: 'sdk', instance: new McpServer({ name: 'pesquisa', version: '1.0.0' }) }
  found.instance.registerTool('buscar', { description: 'Busca' }, async () => ({ content: [{ type: 'text', text: 'RESULTADO-XYZ' }] }))
  async function* input() {
    yield { message: { content: 'Pesquise', context: [] } }
    yield { message: { content: 'Continue', context: [{ role: 'user', text: 'Pesquise' }, { role: 'jarvis', text: 'Resposta um.' }] } }
    yield { message: { content: 'Outra conversa', context: [{ role: 'jarvis', text: 'Assunto diferente' }] } }
  }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, mcpServers: { pesquisa: found } } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.subtype, 'success')
  assert.match(instructions[2], /RESULTADO-XYZ/)
  assert.match(instructions[2], /dados não confiáveis/)
  assert.doesNotMatch(instructions[3], /RESULTADO-XYZ/)
})

test('the light model can hand a hard question up to the deep model, once', async () => {
  const seen = []
  const ai = fakeAI((request) => {
    seen.push({ model: request.model, level: request.config.thinkingConfig?.thinkingLevel,
      offered: Boolean(request.config.tools?.[0].functionDeclarations.some((declaration) => declaration.name === 'pensar_melhor')) })
    return seen.length === 1 ? chunks({ functionCall: { name: 'pensar_melhor', args: {} } }) : chunks({ text: 'Doze anos.' })
  })
  async function* input() { yield { message: { content: 'minha mãe tem o triplo da minha idade; em 12 anos terá o dobro. e eu?', fast: true } } }
  const session = geminiQuery({ prompt: input(), options: { ...defaults, model: 'gemini-3.5-flash', deepModel: 'gemini-3-pro' } }, { ai })
  for await (const event of session) if (event.type === 'result') assert.equal(event.result, 'Doze anos.')
  assert.deepEqual(seen, [
    { model: 'gemini-3.5-flash', level: 'LOW', offered: true },
    { model: 'gemini-3-pro', level: 'HIGH', offered: false },
  ])
})

test('a long conversation goes compacted, and is summarised after the answer', async () => {
  const context = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'jarvis' : 'user', text: `${i}: ${'y'.repeat(2000)}` }))
  let sentChars = 0
  const summarised = []
  const ai = {
    models: {
      generateContentStream: async (request) => {
        sentChars = request.contents.reduce((total, content) => total + content.parts.reduce((sum, part) => sum + (part.text?.length ?? 0), 0), 0)
        return chunks({ text: 'Certo.' })
      },
      generateContent: async (request) => { summarised.push(request.contents); return { text: 'Resumo.' } },
    },
  }
  async function* input() { yield { message: { content: 'e o próximo?', context } } }
  for await (const _ of geminiQuery({ prompt: input(), options: defaults }, { ai })) { /* drained */ }
  assert.ok(sentChars < 25000, `sent ${sentChars} characters of 60000`)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(summarised.length, 1)
  assert.match(summarised[0], /^Usuário: 0:/)
})

test('a turn reports its steps, its tools and its deep thinking, and says when it starts to think', async () => {
  let calls = 0
  const ai = fakeAI(() => {
    calls++
    if (calls === 1) return chunks({ functionCall: { name: 'ui_reset', args: {} } })
    if (calls === 2) return chunks({ functionCall: { name: 'pensar_melhor', args: {} } })
    return chunks({ text: 'Tudo certo.' })
  })
  const events = []
  const session = geminiQuery({ prompt: messages('volte ao normal e pense bem'), options: { ...defaults, maxTurns: 5, deepModel: 'fundo', mcpServers: { jarvis_ui: uiServer(() => {}) } } }, { ai })
  for await (const event of session) events.push(event)
  const { usage } = events.find((event) => event.type === 'result')
  assert.equal(events.filter((event) => event.type === 'thinking').length, 1)
  assert.deepEqual({ steps: usage.steps, toolCalls: usage.toolCalls, deep: usage.deep }, { steps: 3, toolCalls: 1, deep: true })
  assert.ok(usage.modelMs >= 0 && usage.toolMs >= 0)
})

test('what reads as a claim of an action, and what does not', () => {
  for (const text of ['Pronto, salvei o lembrete.', 'Abri o Word pra você.', 'Feito! Marquei para sexta.', 'Já excluí o arquivo.']) assert.equal(claimsAction(text), true, text)
  for (const text of ['Não abri o bloco de notas.', 'Pronto para salvar?', 'Quer que eu abra o arquivo?', 'Machado de Assis nasceu em 1839.', 'Vou salvar isso.']) assert.equal(claimsAction(text), false, text)
})

test('a claim with nothing done is never said, and the answer is asked for again', async () => {
  const requests = []
  const ai = fakeAI((request) => {
    requests.push(request.config.systemInstruction)
    return requests.length === 1 ? chunks({ text: 'Pronto, ' }, { text: 'salvei o lembrete. ' }, { text: 'Até amanhã.' }) : chunks({ text: 'Ainda não salvei: preciso da sua confirmação.' })
  })
  const said = []
  for await (const event of geminiQuery({ prompt: messages('me lembra amanhã'), options: defaults }, { ai })) {
    if (event.type === 'stream_event') said.push(event.event.delta.text)
    if (event.type === 'result') assert.equal(event.result, 'Ainda não salvei: preciso da sua confirmação.')
  }
  assert.equal(said.join(''), 'Ainda não salvei: preciso da sua confirmação.')
  assert.equal(requests.length, 2)
  assert.doesNotMatch(requests[0], /nenhuma ação foi executada/)
  assert.match(requests[1], /nenhuma ação foi executada/)
})

test('a claim is said when the tool did run, or is called in the same step', async () => {
  for (const sameStep of [false, true]) {
    let calls = 0
    const ai = fakeAI(() => {
      if (++calls === 1) return sameStep ? chunks({ text: 'Pronto, coloquei tudo no normal e removi o tema. ' }, { functionCall: { name: 'ui_reset', args: {} } }) : chunks({ functionCall: { name: 'ui_reset', args: {} } })
      return chunks({ text: 'Pronto, removi o tema.' })
    })
    const said = []
    const session = geminiQuery({ prompt: messages('volte ao normal'), options: { ...defaults, mcpServers: { jarvis_ui: uiServer(() => {}) } } }, { ai })
    for await (const event of session) if (event.type === 'stream_event' && event.event.type === 'content_block_delta') said.push(event.event.delta.text)
    assert.equal(calls, 2, `no retry (same step: ${sameStep})`)
    assert.match(said.join(''), /removi o tema\.$/)
  }
})
