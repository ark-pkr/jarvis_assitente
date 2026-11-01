import test from 'node:test'
import assert from 'node:assert/strict'
import { changeVolume, conditionName, dailyServer, fetchWeather } from './daily.mjs'
import { buildBriefing, periodOfDay } from './briefing.mjs'
import { decideTool } from './policy.mjs'

const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
const forecast = {
  current: { temperature_2m: 31.4, apparent_temperature: 34.1, relative_humidity_2m: 60, wind_speed_10m: 12.2, weather_code: 2 },
  daily: { time: ['2026-11-01'], temperature_2m_min: [22.5], temperature_2m_max: [35.1], precipitation_probability_max: [40], weather_code: [80] },
}
const weatherFetch = (places) => async (url) => reply(String(url).includes('geocoding') ? { results: places } : forecast)

test('the weather reads in Portuguese and rounds for speech', async () => {
  const result = await fetchWeather('Balsas', { fetcher: weatherFetch([{ name: 'Balsas', admin1: 'Maranhão', country: 'Brasil', country_code: 'BR', latitude: -7.5, longitude: -46 }]) })
  assert.equal(result.city, 'Balsas, Maranhão, Brasil')
  assert.deepEqual(result.now, { temperature: 31, feelsLike: 34, humidity: 60, windKmh: 12, condition: 'parcialmente nublado' })
  assert.deepEqual(result.days[0], { date: '2026-11-01', min: 23, max: 35, rainChance: 40, condition: 'pancadas de chuva' })
  assert.equal(conditionName(1234), 'condição indefinida')
})

test('a Brazilian city wins, unless the user named somewhere else', async () => {
  const places = [
    { name: 'Palmas', admin1: 'Canárias', country: 'Espanha', country_code: 'ES', latitude: 1, longitude: 1 },
    { name: 'Palmas', admin1: 'Tocantins', country: 'Brasil', country_code: 'BR', latitude: 2, longitude: 2 },
  ]
  assert.match((await fetchWeather('Palmas', { fetcher: weatherFetch(places) })).city, /Tocantins/)
  assert.match((await fetchWeather('Palmas, Espanha', { fetcher: weatherFetch(places) })).city, /Canárias/)
})

test('an unknown city and a failing service each say so plainly', async () => {
  await assert.rejects(fetchWeather('Xyzzy', { fetcher: weatherFetch([]) }), /Não encontrei a cidade Xyzzy/)
  await assert.rejects(fetchWeather('Balsas', { fetcher: async () => reply({}, false) }), /serviço de clima/)
})

test('volume goes up and down from where it is, and stays within range', async () => {
  const calls = []
  const run = async (request) => { calls.push(request); return { volume: 95, muted: false } }
  await changeVolume({ action: 'up' }, run)
  assert.deepEqual(calls.at(-1), { action: 'set_volume', percent: 100 })
  await changeVolume({ action: 'down', percent: 20 }, run)
  assert.deepEqual(calls.at(-1), { action: 'set_volume', percent: 75 })
  await changeVolume({ action: 'set', percent: 30 }, run)
  assert.deepEqual(calls.at(-1), { action: 'set_volume', percent: 30 })
  await changeVolume({ action: 'mute' }, run)
  assert.deepEqual(calls.at(-1), { action: 'mute' })
  await assert.rejects(changeVolume({ action: 'set' }, run), /0 a 100/)
})

test('the everyday tools run without write access, but stay out of private mode', () => {
  assert.equal(decideTool('mcp__jarvis_daily__volume'), true)
  assert.equal(decideTool('mcp__jarvis_daily__weather'), true)
  assert.equal(decideTool('mcp__jarvis_daily__weather', true), false)
  assert.ok(dailyServer())
})

const entry = (values) => ({ status: 'pendente', next: '', updated: 0, title: 'x', ...values })

test('the briefing counts what is owed today and leaves the rest out', () => {
  const now = new Date('2026-11-01T15:00:00-03:00')
  const briefing = buildBriefing([
    entry({ kind: 'lembrete', due: '2026-11-01T09:00:00-03:00' }),
    entry({ kind: 'lembrete', due: '2026-10-30T09:00:00-03:00' }),
    entry({ kind: 'lembrete', due: '2026-11-02T09:00:00-03:00' }),
    entry({ kind: 'lembrete', due: '2026-11-01T09:00:00-03:00', status: 'concluído' }),
    entry({ kind: 'tarefa' }),
    entry({ kind: 'estudo', title: 'Redes', next: 'revisar o capítulo 3.', updated: 2 }),
    entry({ kind: 'projeto', title: 'Antigo', next: 'nada', updated: 1 }),
  ], now)
  assert.equal(briefing.reminders, 2)
  assert.equal(briefing.tasks, 1)
  assert.equal(briefing.line, 'Boa tarde. Você tem dois lembretes e uma tarefa pendente. Em Redes, o próximo passo é revisar o capítulo 3.')
})

test('with nothing saved he says only hello', () => {
  assert.equal(buildBriefing([], new Date('2026-11-01T08:00:00-03:00')).line, 'Bom dia.')
})

test('the greeting follows the clock in Brasília, not the machine', () => {
  assert.equal(periodOfDay(new Date('2026-11-01T02:00:00Z')), 'Boa noite')
  assert.equal(periodOfDay(new Date('2026-11-01T12:00:00Z')), 'Bom dia')
  assert.equal(periodOfDay(new Date('2026-11-01T16:00:00Z')), 'Boa tarde')
  assert.equal(periodOfDay(new Date('2026-11-01T22:00:00Z')), 'Boa noite')
})
