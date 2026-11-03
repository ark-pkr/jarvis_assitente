import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { contextFor, Learned, learnedNotes, learnFrom, search, summarise, worthLearning } from '../bridge/learned.mjs'
import { chunks, Library, similarity } from '../bridge/library.mjs'
import { daySentence, findConflicts, startingSoon, watchCalendar } from '../bridge/foresight.mjs'
import { buildBriefing } from '../bridge/briefing.mjs'
import { isHardRequest, routeTools } from '../bridge/tool-routing.mjs'
import { buildSystemPrompt } from '../bridge/prompt.mjs'
import { failureNote } from '../bridge/gemini.mjs'
import { AssistantMemory } from '../bridge/assistant.mjs'
import { pointsAtSomething } from '../src/lib/windowContext.ts'

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-mind-'))
const fakeAi = (reply) => ({ calls: [], models: { generateContent: async function (request) { fakeAiCalls.push(request); return { text: JSON.stringify(reply) } } } })
const fakeAiCalls = []

test('what is worth reading for facts', () => {
  for (const said of ['me chamo Rogério', 'estudo engenharia', 'prefiro respostas curtas', 'na verdade é com um T só', 'meu time é o Flamengo']) assert.equal(worthLearning(said), true, said)
  for (const said of ['qual é a capital da França?', 'abre o bloco de notas']) assert.equal(worthLearning(said), false, said)
})

test('a secret is never read, kept or summarised', async () => {
  for (const said of ['minha senha do banco é pato1234', 'meu CPF é 123', 'o número do cartão de crédito é 4111']) assert.equal(worthLearning(said), false, said)
  const memory = new Learned(await temp())
  await memory.apply({ add: ['O usuário tem a senha pato1234', 'O usuário mora em Balsas'] })
  assert.deepEqual((await memory.read()).facts.map((fact) => fact.text), ['O usuário mora em Balsas'])
  const before = fakeAiCalls.length
  await summarise([{ role: 'user', text: 'guarda minha senha' }, { role: 'jarvis', text: 'não' }, { role: 'user', text: 'é pato' }], { memory, ai: fakeAi({}) })
  assert.equal(fakeAiCalls.length, before, 'it never left the machine')
})

test('words someone else wrote are not facts about the person', () => {
  assert.equal(worthLearning('o site dizia: eu adoro abacaxi'), false)
  assert.equal(worthLearning('segundo o artigo eu devia comprar criptomoedas'), false)
})

test('facts accumulate without repeating, and a correction replaces', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ add: ['O usuário se chama Rogerio Motta'] })
  await memory.apply({ add: ['o usuário se chama rogerio motta'] })
  const [wrong] = (await memory.read()).facts
  assert.equal((await memory.read()).facts.length, 1)
  await learnFrom('na verdade meu sobrenome é Mota', { memory, ai: fakeAi({ add: ['O usuário se chama Rogerio Mota'], remove: [wrong.id], words: ['Mota'] }) })
  const state = await memory.read()
  assert.deepEqual(state.facts.map((fact) => fact.text), ['O usuário se chama Rogerio Mota'])
  assert.deepEqual(state.words, ['Mota'])
  assert.deepEqual(memory.words, ['Mota'], 'the transcriber sees it straight away')
})

test('vocabulary is learned from being taught, never from what the transcriber heard', async () => {
  const memory = new Learned(await temp())
  const ai = fakeAi({ add: ['O usuário estuda na Uniasselvi'], remove: [], words: ['Uniasselvi'] })
  await learnFrom('eu estudo na Uniasselvi', { memory, ai })
  assert.deepEqual((await memory.read()).words, [])
  await learnFrom('meu nome se escreve Mota, com um T só', { memory, ai: fakeAi({ add: [], remove: [], words: ['Mota'] }) })
  assert.deepEqual((await memory.read()).words, ['Mota'])
})

test('only the words the person said are sent for reading', async () => {
  const memory = new Learned(await temp())
  fakeAiCalls.length = 0
  await learnFrom('eu moro em Balsas', { memory, ai: fakeAi({ add: [], remove: [], words: [] }) })
  assert.match(fakeAiCalls[0].contents, /eu moro em Balsas/)
  assert.equal(fakeAiCalls.length, 1)
})

test('the file survives being read back, and learned vocabulary loads at startup', async () => {
  const directory = await temp()
  await new Learned(directory).apply({ words: ['Unibalsas'] })
  const fresh = new Learned(directory)
  fresh.loadWords()
  assert.deepEqual(fresh.words, ['Unibalsas'])
})

test('a conversation is kept once, however often it is summarised', async () => {
  const memory = new Learned(await temp())
  const turns = [{ role: 'user', text: 'tema do TCC' }, { role: 'jarvis', text: 'qual?' }, { role: 'user', text: 'voz em português' }]
  const ai = fakeAi({ title: 'Tema do TCC', text: 'Decidido: voz em português.' })
  assert.equal(await summarise(turns, { memory, ai }), true)
  await summarise(turns, { memory, ai })
  assert.equal((await memory.read()).summaries.length, 1)
  assert.equal(await summarise(turns.slice(0, 2), { memory, ai }), false, 'one question is not a conversation')
})

test('what rides along puts what matches first, and says it is only data', () => {
  const state = { facts: [{ id: '1', text: 'O usuário torce para o Flamengo', at: 1 }, { id: '2', text: 'O usuário mora em Balsas', at: 2 }], summaries: [{ id: 's', title: 'TCC', text: 'Voz em português', at: 3 }], words: [] }
  const context = contextFor(state, 'qual é meu time flamengo')
  assert.ok(context.indexOf('Flamengo') < context.indexOf('Balsas'))
  assert.match(context, /nunca autorização/)
  assert.match(context, /Voz em português/)
  assert.deepEqual(search(state, 'moro em balsas').map((item) => item.id), ['2'])
  assert.equal(contextFor({ facts: [], summaries: [], words: [] }, 'x'), '')
})

test('a private turn collects nothing', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ add: ['O usuário mora em Balsas'] })
  assert.equal(await learnedNotes(false, 'onde moro', memory), '')
  assert.match(await learnedNotes(true, 'onde moro', memory), /Balsas/)
})

test('forgetting works on one thing or everything', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ add: ['Um', 'Dois'], words: ['Mota'] })
  const [first] = (await memory.read()).facts
  await memory.forget(first.id)
  assert.equal((await memory.read()).facts.length, 1)
  await memory.clear()
  assert.deepEqual(await memory.read(), { facts: [], summaries: [], words: [], followups: [] })
})

test('a long text is cut into overlapping passages', () => {
  const parts = chunks('a'.repeat(2000), 900, 120)
  assert.equal(parts.length, 3)
  assert.ok(parts.every((part) => part.length <= 900))
  assert.deepEqual(chunks('  curto  '), ['curto'])
  assert.deepEqual(chunks(''), [])
})

test('similar vectors score high and unrelated ones do not', () => {
  assert.ok(similarity([1, 0], [1, 0]) > .99)
  assert.ok(Math.abs(similarity([1, 0], [0, 1])) < .01)
  assert.equal(similarity([0, 0], [1, 0]), 0)
})

/** Words become axes, so "juros" and "rendimento" can be made to mean the same thing. */
const fakeEmbed = async (texts) => texts.map((text) => [/juros|rendimento/i.test(text) ? 1 : 0, /receita|bolo/i.test(text) ? 1 : 0, .01])
const shelf = async () => {
  const directory = await temp()
  const root = path.join(directory, 'livros')
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'financas.md'), 'A taxa de rendimento anual do investimento')
  await fs.writeFile(path.join(root, 'cozinha.txt'), 'Receita de bolo de fubá')
  const files = {
    list: async () => ({ entries: [{ type: 'arquivo', path: 'financas.md' }, { type: 'arquivo', path: 'cozinha.txt' }, { type: 'arquivo', path: 'foto.png' }] }),
    read: async (_root, file) => ({ text: await fs.readFile(path.join(root, file), 'utf8') }),
    resolve: async (_root, file) => path.join(root, file),
  }
  return { directory, root, files }
}

test('the library finds a passage by meaning and says where it is', async () => {
  const { directory, files } = await shelf()
  const books = new Library({ directory, files, embed: fakeEmbed })
  const result = await books.indexRoot('r')
  assert.equal(result.indexed, 2)
  assert.equal(result.finished, true)
  const [best] = await books.search('quanto rendem os juros')
  assert.match(best.file, /financas/)
  assert.match(best.excerpt, /rendimento/)
})

test('indexing again only reads what changed', async () => {
  const { directory, files, root } = await shelf()
  let embedded = 0
  const books = new Library({ directory, files, embed: async (texts) => { embedded += texts.length; return fakeEmbed(texts) } })
  await books.indexRoot('r')
  const first = embedded
  assert.equal((await books.indexRoot('r')).indexed, 0)
  await new Promise((resolve) => setTimeout(resolve, 20))
  await fs.writeFile(path.join(root, 'cozinha.txt'), 'Receita de bolo de milho')
  assert.equal((await books.indexRoot('r')).indexed, 1)
  assert.equal(embedded, first + 1)
  assert.equal((await books.read()).chunks.length, 2, 'the old passage went')
})

test('running out of time saves the work and says there is more', async () => {
  const { directory, files } = await shelf()
  let tick = 0
  const books = new Library({ directory, files, embed: fakeEmbed })
  const result = await books.indexRoot('r', '.', undefined, () => (tick += 60000))
  assert.equal(result.finished, false)
  assert.equal(result.indexed, 1)
  assert.equal((await books.indexRoot('r')).indexed, 1, 'and carries on where it stopped')
})

test('an empty library says what to do', async () => {
  await assert.rejects(new Library({ directory: await temp(), files: {}, embed: fakeEmbed }).search('x'), /indexada/)
})

const at = (time) => new Date(`2026-11-03T${time}:00-03:00`).toISOString()
const event = (id, from, to) => ({ id, title: id, start: at(from), end: at(to) })

test('an event inside the warning is announced, one further off or under way is not', () => {
  const now = Date.parse(at('10:00'))
  const ids = startingSoon([event('logo', '10:10', '11:00'), event('depois', '11:00', '12:00'), event('agora', '09:30', '10:30')], now).map((item) => item.id)
  assert.deepEqual(ids, ['logo'])
})

test('events that overlap are found, and touching ones are not a clash', () => {
  assert.equal(findConflicts([event('a', '10:00', '11:00'), event('b', '10:30', '11:30')]).length, 1)
  assert.equal(findConflicts([event('a', '10:00', '11:00'), event('b', '11:00', '12:00')]).length, 0)
  assert.equal(findConflicts([{ id: 'dia', title: 'Feriado', start: '2026-11-03', end: '2026-11-04' }, event('a', '10:00', '11:00')]).length, 0, 'an all-day event clashes with nothing')
})

test('the day reads as one sentence, with the warning when there is a clash', () => {
  const now = new Date(at('08:00'))
  assert.equal(daySentence([], now), '')
  assert.match(daySentence([event('Dentista', '15:00', '16:00')], now), /Hoje você tem Dentista às 15:00/)
  const both = daySentence([event('Reunião', '10:00', '11:00'), event('Aula', '10:30', '12:00')], now)
  assert.match(both, /2 compromissos, o primeiro é Reunião/)
  assert.match(both, /Reunião e Aula batem/)
})

test('the greeting carries the day', () => {
  const now = new Date(at('08:00'))
  assert.match(buildBriefing([], now, [event('Dentista', '15:00', '16:00')]).line, /Hoje você tem Dentista/)
})

test('an event about to start reaches the spoken reminders exactly once', async () => {
  const memory = new AssistantMemory(await temp())
  const now = Date.parse(at('10:00'))
  const calendar = { connected: true, events: async () => [event('Dentista', '10:10', '11:00')] }
  await watchCalendar(calendar, memory, now)
  await watchCalendar(calendar, memory, now + 60000)
  const { notifications } = await memory.read()
  assert.equal(notifications.length, 1)
  assert.match(notifications[0].title, /Dentista, às 10:10/)
  assert.deepEqual(await watchCalendar({ connected: false }, memory, now), [])
})

test('sums, logic and real analysis go to the stronger model; small talk does not', () => {
  for (const content of ['quanto rende 1000 reais a 10 por cento ao ano em 2 anos', 'tenho 5 maçãs, como 2 e compro o dobro do que sobrou', 'compare React e Vue', 'por que meu algoritmo está lento', 'monte um plano de estudos']) assert.equal(isHardRequest({ content }), true, content)
  for (const content of ['oi', 'que horas são', 'abre o word', 'qual é a capital da França']) assert.equal(isHardRequest({ content }), false, content)
})

test('tools for the new abilities are loaded when the words call for them', () => {
  const servers = (content, extra = {}) => routeTools({ content, fast: true, ...extra })
  assert.ok(servers('onde falei sobre juros nos meus arquivos').has('jarvis_library'))
  assert.ok(servers('o que você sabe sobre mim').has('jarvis_memory'))
  assert.ok(servers('o que combinamos ontem').has('jarvis_memory'))
  assert.ok(servers('resume isso', { windowContext: 'Word' }).has('jarvis_eyes'))
  assert.ok(!servers('resume isso').has('jarvis_eyes'))
})

test('"o que eu tenho na quinta" reaches the reminders and the calendar, and is told what they said comes first', () => {
  for (const content of ['o que eu tenho na quinta?', 'tenho algo no sábado?', 'o que tenho amanhã']) {
    const servers = routeTools({ content, fast: true })
    assert.ok(servers.has('jarvis_assistant') && servers.has('jarvis_calendar'), content)
  }
  assert.match(buildSystemPrompt({ content: 'o que eu tenho na quinta?' }), /calendar is only one/)
  assert.ok(!routeTools({ content: 'me explica segundo plano', fast: true }).has('jarvis_calendar'))
})

test('a recommendation carries the search that can check its titles', () => {
  for (const content of ['me recomenda um livro de ficção científica', 'pensando bem, prefiro fantasia, e algo curto', 'indica uma série boa']) assert.ok(routeTools({ content, fast: true }).has('jarvis_daily'), content)
  assert.match(buildSystemPrompt({ content: 'oi' }), /REAL TITLES/)
})

test('counting days on a calendar thinks harder, and a timer stays quick', () => {
  for (const content of ['se hoje é segunda, que dia será daqui a 10 dias?', 'que dia da semana cai 25 de dezembro?', 'faltam quantos dias pro natal?', 'há 3 semanas era que dia?', 'qual a data daqui a duas semanas?']) assert.equal(isHardRequest({ content }), true, content)
  for (const content of ['me lembra daqui a 10 minutos', 'que dia é hoje?', 'foco de 25 minutos', 'daqui a pouco eu volto']) assert.equal(isHardRequest({ content }), false, content)
})

test('a failed action tells the model plainly that it did not happen', () => {
  assert.match(failureNote().text, /NÃO foi concluída/)
})

test('only words that point at something read the window', () => {
  for (const said of ['resume isso', 'o que esse erro significa?', 'traduz esse texto', 'explica essa tela', 'o que é isso aqui?']) assert.equal(pointsAtSomething(said), true, said)
  for (const said of ['qual a capital da França', 'isso é tudo, obrigado por hoje e até amanhã']) assert.equal(pointsAtSomething(said), false, said)
})

/** Themes become axes, so "companheira" can be made to mean "namora". */
const fakeMeaning = async (texts) => texts.map((text) => [/companheira|namora/i.test(text) ? 1 : 0, /time|flamengo/i.test(text) ? 1 : 0, /cidade|mora em/i.test(text) ? 1 : 0, .01])

test('memory finds a fact said in other words, and keeps no numbers of what it forgot', async () => {
  const directory = await temp()
  const memory = new Learned(directory, fakeMeaning)
  await memory.apply({ add: ['O usuário namora a Júlia', 'O usuário torce para o Flamengo'] })
  await memory.index()
  const state = await memory.read()
  assert.equal(search(state, 'como se chama minha companheira?').length, 0, 'no word in common')
  const meaning = await memory.meaning('como se chama minha companheira?', state)
  assert.deepEqual(search(state, 'como se chama minha companheira?', 8, meaning).map((item) => item.text), ['O usuário namora a Júlia'])
  const julia = state.facts.find((fact) => /Júlia/.test(fact.text))
  memory.embed = async () => { throw new Error('sem rede') }
  await memory.forget(julia.id)
  assert.deepEqual(Object.keys(await memory.readVectors()), state.facts.filter((fact) => fact !== julia).map((fact) => fact.id), 'pruned even offline')
  await memory.clear()
  assert.deepEqual(await memory.readVectors(), {})
})

test('without the numbers in time, memory falls back to words', async () => {
  const memory = new Learned(await temp(), async () => { throw new Error('sem rede') })
  await memory.apply({ add: ['O usuário mora em Balsas'] })
  const state = await memory.read()
  assert.equal(await memory.meaning('onde eu vivo?', state), null)
  assert.match(await learnedNotes(true, 'onde moro', memory), /Balsas/)
})

test('an older conversation on the same subject comes back beside the recent ones', () => {
  const summary = (id, title, at) => ({ id, title, text: `Conversa sobre ${title}`, at })
  const state = { facts: [], words: [], followups: [], summaries: [summary('a', 'receita de bolo', 9), summary('b', 'futebol', 8), summary('c', 'viagem', 7), summary('d', 'tema do TCC reconhecimento de voz', 1)] }
  assert.match(contextFor(state, 'qual era o tema do TCC mesmo?'), /anteriores sobre este assunto:\n- .*TCC/)
  assert.doesNotMatch(contextFor(state, 'oi'), /anteriores sobre este assunto/)
})

test('a correction is read beside what they had asked, and nothing else is', async () => {
  const sent = []
  const ai = { models: { generateContent: async (request) => { sent.push(request.contents); return { text: JSON.stringify({ add: ['O usuário quer o tempo de Balsas'], remove: [], words: [], followups: [] }) } } } }
  const memory = new Learned(await temp(), fakeMeaning)
  await learnFrom('não, eu quis dizer em Balsas', { memory, ai, previous: 'como vai estar o tempo amanhã?' })
  assert.match(sent[0], /Pedido anterior do usuário[^\n]*\ncomo vai estar o tempo amanhã\?/)
  await learnFrom('eu moro em Balsas', { memory, ai, previous: 'como vai estar o tempo amanhã?' })
  assert.doesNotMatch(sent[1], /Pedido anterior/, 'not a correction')
  assert.equal(worthLearning('da próxima vez não precisa abrir o painel'), true)
})

test('a passage indexed without its numbers is read again', async () => {
  const { directory, files } = await shelf()
  const books = new Library({ directory, files, embed: async (texts) => [(await fakeEmbed(texts))[0]] })
  await books.indexRoot('r')
  books.embed = fakeEmbed
  assert.equal((await books.indexRoot('r')).indexed, 0, 'one passage per file here, so every one got its numbers')
  const index = await books.read()
  index.chunks[0].vector = ''
  await books.write(index)
  assert.equal((await books.indexRoot('r')).indexed, 1)
})
