import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { webAnswer } from './search.mjs'
import { unpacked } from './paths.mjs'

/**
 * The small everyday things: the weather, the music, the volume, a quick fact.
 *
 * Unlike the rest of the tools that change something, media and volume do not
 * ask for confirmation. A dialog in front of "pausa a música" defeats the
 * request, and nothing here is hard to undo.
 */

const CONDITIONS = [
  [[0], 'céu limpo'], [[1], 'céu quase limpo'], [[2], 'parcialmente nublado'], [[3], 'nublado'],
  [[45, 48], 'neblina'], [[51, 53, 55, 56, 57], 'garoa'], [[61, 63, 66], 'chuva'], [[65, 67], 'chuva forte'],
  [[71, 73, 75, 77], 'neve'], [[80, 81], 'pancadas de chuva'], [[82], 'pancadas fortes de chuva'],
  [[85, 86], 'pancadas de neve'], [[95], 'trovoada'], [[96, 99], 'trovoada com granizo'],
]

export const conditionName = (code) => CONDITIONS.find(([codes]) => codes.includes(code))?.[1] ?? 'condição indefinida'

async function json(url, fetcher, signal) {
  const response = await fetcher(url, { signal })
  if (!response.ok) throw new Error(`O serviço de clima respondeu ${response.status}.`)
  return response.json()
}

/**
 * What was already looked up. Each lookup is a round trip of 0.2 to 1 s, and
 * about 2 s when the connection is cold, which the person waits through on top
 * of the model. A city does not move, so where it is is kept for as long as the
 * bridge runs; a forecast is kept for ten minutes, so the follow-up question
 * ("e amanhã?") costs nothing. Kept per fetcher, so tests never share it.
 */
const FORECAST_FRESH_MS = 10 * 60 * 1000
const remembered = new WeakMap()
function rememberedFor(fetcher) {
  if (!remembered.has(fetcher)) remembered.set(fetcher, { places: new Map(), forecasts: new Map() })
  return remembered.get(fetcher)
}

/**
 * Open-Meteo needs no key, so the weather works from a fresh install.
 *
 * "Balsas, Maranhão" is split because the geocoder searches names rather than
 * phrases, and a Brazilian match wins because that is who is asking: "Palmas"
 * should not land in Spain.
 */
export async function fetchWeather(city, { fetcher = fetch, signal, days = 1, now = Date.now } = {}) {
  const [name, ...region] = String(city).split(',').map((part) => part.trim()).filter(Boolean)
  if (!name) throw new Error('Informe a cidade.')
  const memory = rememberedFor(fetcher)
  const key = String(city).trim().toLocaleLowerCase('pt-BR')
  let place = memory.places.get(key)
  if (!place) {
    const found = await json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=pt&format=json`, fetcher, signal)
    const places = found.results ?? []
    const wanted = region.join(' ').toLocaleLowerCase('pt-BR')
    place = (wanted && places.find((item) => `${item.admin1 ?? ''} ${item.country ?? ''}`.toLocaleLowerCase('pt-BR').includes(wanted)))
      || places.find((item) => item.country_code === 'BR') || places[0]
    if (!place) throw new Error(`Não encontrei a cidade ${name}.`)
    memory.places.set(key, place)
  }
  const spot = `${place.latitude},${place.longitude},${days}`
  const kept = memory.forecasts.get(spot)
  let forecast = kept && now() - kept.at < FORECAST_FRESH_MS ? kept.forecast : null
  if (!forecast) {
    forecast = await json(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=${days}`, fetcher, signal)
    memory.forecasts.set(spot, { at: now(), forecast })
  }
  const { current, daily } = forecast
  return {
    city: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    now: { temperature: Math.round(current.temperature_2m), feelsLike: Math.round(current.apparent_temperature), humidity: current.relative_humidity_2m, windKmh: Math.round(current.wind_speed_10m), condition: conditionName(current.weather_code) },
    days: daily.time.map((date, index) => ({ date, min: Math.round(daily.temperature_2m_min[index]), max: Math.round(daily.temperature_2m_max[index]), rainChance: daily.precipitation_probability_max[index], condition: conditionName(daily.weather_code[index]) })),
  }
}

/** Runs one fixed action through media.ps1. */
export function runMedia(request) {
  return new Promise((resolve, reject) => {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', unpacked(fileURLToPath(new URL('./media.ps1', import.meta.url)))], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('O Windows não respondeu ao controle de mídia.')) }, 12000)
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', () => {}); child.stdin.on('error', () => {})
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('Não foi possível controlar a mídia do Windows.'))
      try { resolve(JSON.parse(output.replace(/^\uFEFF/, ''))) } catch { reject(new Error('Resposta inválida do Windows.')) }
    })
    child.stdin.end(JSON.stringify(request), 'utf8')
  })
}

export const MEDIA_ACTIONS = ['play_pause', 'next', 'previous', 'stop']
export const VOLUME_ACTIONS = ['get', 'set', 'up', 'down', 'mute', 'unmute']
/** How far "aumenta o volume" moves, in the absence of a number. */
const VOLUME_STEP = 10

export async function changeVolume({ action, percent }, run = runMedia) {
  const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)))
  if (action === 'get') return run({ action: 'get_volume' })
  if (action === 'mute' || action === 'unmute') return run({ action })
  if (action === 'set') {
    if (typeof percent !== 'number' || !Number.isFinite(percent)) throw new Error('Informe o volume de 0 a 100.')
    return run({ action: 'set_volume', percent: clamp(percent) })
  }
  const { volume } = await run({ action: 'get_volume' })
  const step = typeof percent === 'number' && Number.isFinite(percent) ? Math.abs(percent) : VOLUME_STEP
  return run({ action: 'set_volume', percent: clamp(volume + (action === 'up' ? step : -step)) })
}

export function dailyServer({ run = runMedia, fetcher = fetch, search = webAnswer } = {}) {
  const safe = (handler) => async (args, extra) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await handler(args, extra?.signal)) }] } }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] } }
  }
  return createSdkMcpServer({ name: 'jarvis_daily', version: '1.0.0', alwaysLoad: true, tools: [
    tool('weather', 'Consulta o clima atual e a previsão de até sete dias de uma cidade. Use a cidade padrão das preferências quando o usuário não disser outra; sem nenhuma, pergunte qual. Não pede confirmação.', { city: z.string().trim().min(2).max(120), days: z.number().int().min(1).max(7).optional() }, safe(({ city, days }, signal) => fetchWeather(city, { fetcher, signal, days }))),
    tool('web_answer', 'Responde em segundos uma pergunta sobre algo atual, como notícia, placar, preço, cotação ou resultado, usando a busca do Google. Prefira isto ao navegador quando bastar um dado. Use o navegador para ler uma página inteira ou agir em um site. Fale a resposta em poucas frases. Não pede confirmação.', { question: z.string().trim().min(3).max(300) }, safe(({ question }, signal) => search(question, { signal }))),
    tool('media_control', 'Envia ao Windows uma tecla de mídia: tocar ou pausar, próxima faixa, faixa anterior ou parar. Age no player que o Windows considerar ativo, como Spotify ou YouTube. O resultado não comprova qual aplicativo reagiu. Não pede confirmação.', { action: z.enum(MEDIA_ACTIONS) }, safe(({ action }) => run({ action }))),
    tool('volume', 'Consulta ou muda o volume geral do Windows. Em set, percent é o nível de 0 a 100. Em up e down, percent é o quanto mudar, com 10 como padrão. Não pede confirmação.', { action: z.enum(VOLUME_ACTIONS), percent: z.number().min(0).max(100).optional() }, safe((args) => changeVolume(args, run))),
  ] })
}
