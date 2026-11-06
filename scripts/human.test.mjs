import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readTone } from '../bridge/gemini.mjs'
import { contextFor, Learned, learnFrom, worthLearning } from '../bridge/learned.mjs'
import { openingRemark, pickNudge, Rapport, handleNudge } from '../bridge/rapport.mjs'
import { buildBriefing } from '../bridge/briefing.mjs'
import { speechPrompt, speechRequest } from '../bridge/speech.mjs'
import { buildSystemPrompt } from '../bridge/prompt.mjs'
import { routeTools } from '../bridge/tool-routing.mjs'
import { acknowledge, attention, speakFormally, working } from '../src/lib/fillers.ts'
import { SpeechGate } from '../src/lib/speechGate.ts'

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-human-'))
const at = (text) => Date.parse(text)
const DAY = 86400000
const first = () => 0

// -- how he sounds -----------------------------------------------------------

test('the everyday register leaves the butler to the formal personality', () => {
  speakFormally(false)
  for (let i = 0; i < 30; i++) for (const pick of [working, acknowledge, attention]) assert.equal(/senhor|certamente/i.test(pick()), false)
  speakFormally(true)
  const lines = Array.from({ length: 30 }, attention)
  assert.ok(lines.some((line) => line.includes('senhor')))
  speakFormally(false)
})

test('the same line never comes twice running', () => {
  let last = ''
  for (let i = 0; i < 40; i++) { const line = working(); assert.notEqual(line, last); last = line }
})

test('the prompt asks for a person, and formal takes it back', () => {
  const prompt = buildSystemPrompt({ content: 'oi' })
  for (const rule of ['SOUNDING LIKE A PERSON', 'HAVING AN OPINION', 'TONE OF VOICE']) assert.ok(prompt.includes(rule), rule)
  assert.ok(buildSystemPrompt({ content: 'oi', personality: 'formal' }).includes('overriding the everyday tone'))
})

// -- tone of voice -----------------------------------------------------------

test('a tag sets the tone and is never said', () => {
  assert.deepEqual(readTone('[animado] Passou!'), { tone: 'animado', text: 'Passou!' })
  assert.deepEqual(readTone('  [SERIO] Atenção.'), { tone: 'serio', text: 'Atenção.' })
})

test('no tag holds nothing back', () => {
  assert.deepEqual(readTone('Paris.'), { text: 'Paris.' })
})

test('a tag split across chunks waits for the rest of itself', () => {
  assert.deepEqual(readTone('['), { pending: true })
  assert.deepEqual(readTone('[anim'), { pending: true })
  assert.deepEqual(readTone('[animado'), { pending: true })
  assert.deepEqual(readTone('[animado] O'), { tone: 'animado', text: 'O' })
})

test('brackets that are not a tag come through as written', () => {
  assert.deepEqual(readTone('[1] Primeiro item'), { text: '[1] Primeiro item' })
  assert.deepEqual(readTone('[sem nenhum fechamento por aqui'), { text: '[sem nenhum fechamento por aqui' })
})

test('the voice prompt carries the tone, and an unknown one adds nothing', () => {
  assert.ok(speechPrompt('Oi', 'animado').includes('sorriso'))
  assert.equal(speechPrompt('Oi', 'constructor'), speechPrompt('Oi'))
  assert.equal(speechPrompt('Oi', null), speechPrompt('Oi'))
})

test('the spare voice gets the sentence alone, with a tag for its tone', () => {
  assert.equal(speechRequest('gemini-3.8-flash-tts', 'Lima.'), 'Lima.')
  assert.equal(speechRequest('gemini-3.8-flash-tts', 'Passou!', 'animado'), '[excited] Passou!')
  assert.equal(speechRequest('gemini-3.8-flash-tts', 'Lima.', 'constructor'), 'Lima.')
  assert.ok(speechRequest('gemini-3.1-flash-tts-preview', 'Lima.').startsWith('Leia apenas'))
})

// -- hello -------------------------------------------------------------------

test('a normal day gets a normal hello', () => {
  const now = at('2026-11-02T10:00:00-03:00')
  assert.equal(openingRemark({ now, lastSeen: now - DAY }), '')
  assert.equal(openingRemark({ now }), '', 'nobody has been away the first time')
})

test('he notices days away', () => {
  const now = at('2026-11-02T10:00:00-03:00')
  assert.equal(openingRemark({ now, lastSeen: now - 3 * DAY, random: first }), 'Sumiu, hein? Faz três dias.')
})

test('he notices the hour, in Brasília', () => {
  assert.equal(openingRemark({ now: at('2026-11-02T02:30:00-03:00'), lastSeen: at('2026-11-02T01:00:00-03:00'), random: first }), 'Ainda de pé às duas da manhã?')
  assert.equal(openingRemark({ now: at('2026-11-02T01:10:00-03:00'), random: first }), 'Ainda de pé à uma da manhã?')
  assert.equal(openingRemark({ now: at('2026-11-02T00:10:00-03:00'), random: first }), 'Ainda de pé à meia-noite?')
})

test('the briefing opens with the remark and carries the question', () => {
  const briefing = buildBriefing([], new Date('2026-11-02T10:00:00-03:00'), [], 0, 'Sumiu, hein? Faz três dias.', 'E aí, como foi a prova?')
  assert.equal(briefing.opening, 'Bom dia. Sumiu, hein? Faz três dias.')
  assert.equal(briefing.line, 'Bom dia. Sumiu, hein? Faz três dias. E aí, como foi a prova?')
})

// -- what you told him -------------------------------------------------------

const told = (reply) => ({ models: { generateContent: async (request) => { told.last = request; return { text: JSON.stringify(reply) } } } })
const NOW = at('2026-11-02T10:00:00-03:00')
const EXAM = { about: 'prova de cálculo', date: '2026-11-06', ask: 'E aí, como foi a prova de cálculo?' }

test('something coming up is kept to be asked about', async () => {
  assert.equal(worthLearning('tenho prova de cálculo na sexta'), true)
  const memory = new Learned(await temp())
  await learnFrom('tenho prova de cálculo na sexta', { memory, now: NOW, ai: told({ add: [], remove: [], words: [], followups: [EXAM] }) })
  assert.ok(told.last.contents.includes('2026-11-02'), 'he is told what day it is')
  const state = await memory.read()
  assert.equal(state.followups[0].ask, EXAM.ask)
  assert.deepEqual(memory.followupsDue(state, NOW), [], 'not before it happens')
  assert.deepEqual(memory.followupsDue(state, at('2026-11-06T12:00:00-03:00')), [], 'not on the day')
  assert.equal(memory.followupsDue(state, at('2026-11-07T10:00:00-03:00')).length, 1)
  assert.deepEqual(memory.followupsDue(state, at('2026-11-30T10:00:00-03:00')), [], 'and not weeks later')
})

test('what is coming up rides along, so "o que eu tenho na quinta?" has an answer', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ followups: [EXAM] }, NOW)
  const state = await memory.read()
  assert.ok(contextFor(state, 'o que eu tenho na sexta?', NOW).includes('2026-11-06: prova de cálculo'))
  assert.equal(contextFor(state, 'oi', at('2026-11-07T10:00:00-03:00')), '', 'not once it has passed')
})

test('a date in the past, a bad date or a far one is dropped', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ followups: [{ ...EXAM, date: '2026-10-01' }, { ...EXAM, about: 'x', date: 'sexta' }, { ...EXAM, about: 'y', date: '2028-01-01' }, { ...EXAM, about: 'senha do banco', ask: 'E a senha do banco?' }] }, NOW)
  assert.deepEqual((await memory.read()).followups, [])
})

test('the same thing said twice is kept once, and asked once', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ followups: [EXAM] }, NOW)
  await memory.apply({ followups: [{ ...EXAM, about: 'Prova de Cálculo' }] }, NOW)
  const [only, ...rest] = (await memory.read()).followups
  assert.equal(rest.length, 0)
  await memory.followupAsked(only.id)
  assert.equal((await memory.read()).followups.length, 0)
})

test('it can be taken back by hand', async () => {
  const memory = new Learned(await temp())
  await memory.apply({ followups: [EXAM] }, NOW)
  await memory.forget((await memory.read()).followups[0].id)
  assert.equal((await memory.read()).followups.length, 0)
})

// -- speaking first ----------------------------------------------------------

const MORNING = at('2026-11-07T10:00:00-03:00')
const around = { lastSeen: MORNING - 20 * 60000, lastNudgeDay: '', nudged: {} }
const FOLLOWUP = { id: 'a', ask: 'E aí, como foi a prova?' }
const stale = (days, values = {}) => ({ id: 'tcc', kind: 'projeto', title: 'TCC', next: 'escrever', status: 'pendente', updated: MORNING - days * DAY, ...values })
const nudge = (values) => pickNudge({ followups: [], entries: [], state: around, now: MORNING, ...values })

test('what happened comes before what is waiting', () => {
  assert.equal(nudge({ followups: [FOLLOWUP], entries: [stale(5)] }).say, FOLLOWUP.ask)
})

test('work left alone gets one word', () => {
  assert.equal(nudge({ entries: [stale(3)] }).say, 'Faz três dias que você não mexe em TCC. Quer retomar?')
  assert.equal(nudge({ entries: [stale(2)] }), null, 'two days is nothing')
  assert.equal(nudge({ entries: [stale(9, { status: 'concluído' })] }), null)
  assert.equal(nudge({ entries: [stale(9, { next: '' })] }), null, 'with no next step there is nothing to offer')
  assert.equal(nudge({ entries: [stale(9, { kind: 'tarefa' })] }), null)
})

test('never asleep, never twice in a day, never over a conversation, never to an empty room', () => {
  const entries = [stale(5)]
  assert.equal(nudge({ entries, now: at('2026-11-07T08:59:00-03:00'), state: { ...around, lastSeen: at('2026-11-07T08:40:00-03:00') } }), null)
  assert.equal(nudge({ entries, now: at('2026-11-07T21:00:00-03:00'), state: { ...around, lastSeen: at('2026-11-07T20:40:00-03:00') } }), null)
  assert.equal(nudge({ entries, state: { ...around, lastNudgeDay: '2026-11-07' } }), null)
  assert.equal(nudge({ entries, state: { ...around, lastSeen: MORNING - 5 * 60000 } }), null)
  assert.equal(nudge({ entries, state: { ...around, lastSeen: MORNING - 5 * 3600000 } }), null)
  assert.equal(nudge({ entries, state: { ...around, lastSeen: 0 } }), null)
})

test('study reviews that came due get mentioned, every other day at most', () => {
  assert.equal(nudge({ reviews: 1 }).say, 'Tem uma pergunta de revisão do seu estudo esperando. Quer responder agora? É rapidinho.')
  assert.equal(nudge({ reviews: 4, entries: [stale(5)] }).say, 'Tem quatro perguntas de revisão do seu estudo esperando. Quer fazer dez minutinhos agora?', 'a revisão vem antes do projeto parado')
  assert.equal(nudge({ reviews: 4, followups: [FOLLOWUP] }).say, FOLLOWUP.ask, 'o que aconteceu ainda vem primeiro')
  assert.equal(nudge({ reviews: 4, state: { ...around, nudged: { reviews: MORNING - DAY } } }), null, 'ontem já lembrou')
  assert.ok(nudge({ reviews: 4, state: { ...around, nudged: { reviews: MORNING - 2 * DAY } } }))
  assert.equal(nudge({ reviews: 0 }), null)
})

test('the same project waits a week', () => {
  const entries = [stale(5)]
  assert.equal(nudge({ entries, state: { ...around, nudged: { tcc: MORNING - 3 * DAY } } }), null)
  assert.ok(nudge({ entries, state: { ...around, nudged: { tcc: MORNING - 8 * DAY } } }))
})

test('saying it once uses up the day', async () => {
  const friend = new Rapport(await temp())
  const notes = new Learned(await temp())
  await notes.apply({ followups: [EXAM] }, NOW)
  await friend.mutate((state) => { state.lastSeen = at('2026-11-07T09:40:00-03:00') })
  const ask = async () => {
    let body = ''
    await handleNudge({}, { writeHead() {}, end(text) { body = text } }, {}, { memory: { read: async () => ({ entries: [] }) }, notes, friend, clock: () => at('2026-11-07T10:00:00-03:00') })
    return JSON.parse(body).say
  }
  assert.equal(await ask(), EXAM.ask)
  assert.equal(await ask(), '')
  assert.equal((await notes.read()).followups.length, 0)
})

test('the disk is not written on every word', async () => {
  const friend = new Rapport(await temp())
  await friend.seen(1000000)
  await friend.seen(1000001)
  assert.equal((await friend.read()).lastSeen, 1000000)
  await friend.seen(1000000 + 6 * 60000)
  assert.equal((await friend.read()).lastSeen, 1000000 + 6 * 60000)
})

test('being asked to stop reaches the setting', () => {
  assert.ok(routeTools({ content: 'para de puxar assunto', fast: true }).has('jarvis_ui'))
})

// -- interrupting ------------------------------------------------------------

test('speech already confirmed carries on and ends like any other', () => {
  const gate = new SpeechGate()
  for (let i = 0; i < 6; i++) gate.feed(.001, 100, 800)
  gate.begin(320)
  assert.equal(gate.speaking, true)
  assert.equal(gate.feed(.05, 300, 800), null)
  let event = null
  for (let i = 0; i < 12 && !event; i++) event = gate.feed(.0001, 100, 800)
  assert.equal(event, 'end')
})
