import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Calendar } from '../bridge/calendar.mjs'
import { readAnswer, webAnswer } from '../bridge/search.mjs'
import { decideTool } from '../bridge/policy.mjs'
import { routeTools } from '../bridge/tool-routing.mjs'
import { alertLine, alertsToSpeak } from '../src/lib/spokenAlerts.ts'
import { isExplicitInterruption } from '../src/lib/voiceGuard.ts'

const { connectCalendar } = createRequire(import.meta.url)('../desktop/calendar-auth.cjs')

const fakeGoogle = (reply) => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), ...init })
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'acesso', expires_in: 3600 })
    return reply(String(url), init)
  }
  return { calls, fetcher }
}
const connected = (fetcher) => new Calendar({ clientId: 'id', clientSecret: 'chave', refreshToken: 'renovar', fetcher })

test('a web answer brings its sources, once each', () => {
  const web = (uri, title) => ({ web: { uri, title } })
  const { text, sources } = readAnswer({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Três a um.' }] }, groundingMetadata: { groundingChunks: [web('https://a', 'A'), web('https://a', 'A'), web('https://b', 'B')] } }] })
  assert.equal(text, 'Três a um.')
  assert.deepEqual(sources.map((source) => source.url), ['https://a', 'https://b'])
})

test('without the light model the search still works, and a real failure says so', async () => {
  const asked = []
  const ai = { models: { generateContent: async ({ model }) => {
    asked.push(model)
    if (asked.length === 1) throw Object.assign(new Error('sem modelo'), { status: 404 })
    return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
  } } }
  assert.equal((await webAnswer('placar', { ai })).answer, 'ok')
  assert.equal(asked.length, 2)
  const broken = { models: { generateContent: async () => { throw Object.assign(new Error('cota'), { status: 429 }) } } }
  await assert.rejects(webAnswer('placar', { ai: broken }), /cota/)
})

test('an empty search is an error, not an empty answer', async () => {
  const ai = { models: { generateContent: async () => ({ candidates: [{ content: { parts: [] } }] }) } }
  await assert.rejects(webAnswer('placar', { ai }), /não trouxe/)
})

test('the calendar lists events with only what the model needs', async () => {
  const { calls, fetcher } = fakeGoogle(() => Response.json({ items: [{ id: '1', summary: 'Dentista', start: { dateTime: '2026-11-03T15:00:00-03:00' }, end: { dateTime: '2026-11-03T16:00:00-03:00' }, attendees: [{ email: 'outra@pessoa.test' }] }] }))
  const [event] = await connected(fetcher).events({ from: '2026-11-03T00:00:00-03:00', to: '2026-11-04T00:00:00-03:00' })
  assert.equal(event.title, 'Dentista')
  assert.equal(event.attendees, undefined)
  const list = calls.find((call) => call.url.includes('/events?'))
  assert.equal(list.headers.authorization, 'Bearer acesso')
  assert.match(list.url, /singleEvents=true/)
})

test('a token is reused until it is close to expiring', async () => {
  const { calls, fetcher } = fakeGoogle(() => Response.json({ items: [] }))
  const calendar = connected(fetcher)
  await calendar.events({ from: 'a', to: 'b' })
  await calendar.events({ from: 'a', to: 'b' })
  assert.equal(calls.filter((call) => call.url.includes('oauth2')).length, 1)
})

test('a change sends only what changes', async () => {
  const { calls, fetcher } = fakeGoogle(() => Response.json({ id: '1', summary: 'Dentista' }))
  await connected(fetcher).change('1', { start: '2026-11-03T16:00:00-03:00' })
  const sent = JSON.parse(calls.find((call) => call.method === 'PATCH').body)
  assert.deepEqual(Object.keys(sent), ['start'])
})

test('without a connection, the calendar says where to connect', async () => {
  await assert.rejects(new Calendar().events({ from: 'a', to: 'b' }), /Histórico e ajustes/)
})

test('a revoked connection asks to connect again', async () => {
  const calendar = new Calendar({ clientId: 'id', refreshToken: 'x', fetcher: async () => new Response('', { status: 400 }) })
  await assert.rejects(calendar.events({ from: 'a', to: 'b' }), /Conecte de novo/)
})

const signIn = (fetcher, answer) => {
  let address
  const done = connectCalendar({ clientId: 'id', clientSecret: 'chave', fetcher, waitMs: 2000, open: async (url) => { address = new URL(url); void answer(address) } })
  return { done, sent: () => address }
}
const backTo = (address) => address.searchParams.get('redirect_uri')

test('signing in returns the refresh token and proves the attempt with PKCE', async () => {
  let body
  const fetcher = async (_url, init) => { body = init.body; return Response.json({ refresh_token: 'guardar' }) }
  const { done, sent } = signIn(fetcher, (address) => fetch(`${backTo(address)}/?code=abc&state=${address.searchParams.get('state')}`))
  assert.equal(await done, 'guardar')
  assert.equal(sent().searchParams.get('code_challenge_method'), 'S256')
  assert.equal(sent().searchParams.get('access_type'), 'offline')
  assert.ok(body.get('code_verifier').length > 40)
})

test('an answer from another attempt is refused and the real one still lands', async () => {
  const fetcher = async () => Response.json({ refresh_token: 'guardar' })
  const { done } = signIn(fetcher, async (address) => {
    const forged = await fetch(`${backTo(address)}/?code=roubado&state=outro`)
    assert.match(await forged.text(), /recusado/)
    await fetch(`${backTo(address)}/?code=abc&state=${address.searchParams.get('state')}`)
  })
  assert.equal(await done, 'guardar')
})

test('cancelling at Google ends the attempt, and so does waiting too long', async () => {
  const { done } = signIn(async () => Response.json({}), (address) => fetch(`${backTo(address)}/?error=access_denied&state=${address.searchParams.get('state')}`))
  await assert.rejects(done, /cancelada/)
  await assert.rejects(connectCalendar({ clientId: 'id', clientSecret: 'chave', waitMs: 30, open: async () => {} }), /Tempo esgotado/)
})

test('the calendar and the search go only where they are asked for', () => {
  const servers = (content) => routeTools({ content, fast: true })
  assert.ok(servers('o que tenho na agenda amanhã').has('jarvis_calendar'))
  assert.ok(servers('marca dentista sexta às três').has('jarvis_calendar'))
  assert.ok(servers('quanto foi o jogo do flamengo').has('jarvis_daily'))
  assert.ok(servers('qual a cotação do dólar').has('jarvis_daily'))
  assert.ok(!servers('me conta uma piada').has('jarvis_calendar'))
})

test('in private mode neither the calendar nor the search is offered', () => {
  assert.equal(decideTool('mcp__jarvis_calendar__calendar_events'), true)
  assert.equal(decideTool('mcp__jarvis_calendar__calendar_events', true), false)
  assert.equal(decideTool('mcp__jarvis_daily__web_answer', true), false)
})

test('only a reminder that just came due is spoken, and only once', () => {
  const now = 1_000_000_000
  const alerts = [{ id: 'b', title: 'Pão', time: now - 5000 }, { id: 'a', title: 'Reunião', time: now - 6000 }, { id: 'velho', title: 'Antigo', time: now - 3_600_000 }]
  assert.deepEqual(alertsToSpeak(alerts, new Set(), now).map((alert) => alert.id), ['a', 'b'])
  assert.deepEqual(alertsToSpeak(alerts, new Set(['a']), now).map((alert) => alert.id), ['b'])
})

test('one reminder or several read naturally', () => {
  assert.equal(alertLine([{ id: '1', title: 'Pão', time: 0 }]), 'Lembrete: Pão.')
  assert.match(alertLine([{ id: '1', title: 'Pão', time: 0 }, { id: '2', title: 'Gás', time: 0 }]), /^Você tem 2 lembretes\. Pão\. Gás\.$/)
})

test('after his name, the ordinary ways of saying stop all work', () => {
  for (const said of ['Jarvis, pare', 'Jarvis, chega', 'Oi Jarvis, tá bom', 'Jarvis, já entendi', 'Jarvis, pode parar', 'Jarvis, obrigado']) assert.equal(isExplicitInterruption(said), true, said)
})

test('without his name nothing interrupts, because that may be him on the speakers', () => {
  for (const said of ['chega', 'tá bom', 'pare', 'já entendi', 'Jarvis, qual é a capital da França']) assert.equal(isExplicitInterruption(said), false, said)
})
