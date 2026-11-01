import { assistantMemory } from './assistant.mjs'
import { fetchWeather } from './daily.mjs'

/**
 * What JARVIS says when he comes up.
 *
 * Built here from the saved records rather than asked of the model: it is
 * instant, costs nothing, and cannot invent a task. If there is nothing to say
 * it says only hello.
 */

const TIME_ZONE = 'America/Sao_Paulo'
const WORDS = {
  m: ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'],
  f: ['uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'],
}
const count = (n, gender, one, many) => `${WORDS[gender][n - 1] ?? n} ${n === 1 ? one : many}`

const localDay = (date) => date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE })

export function periodOfDay(now = new Date()) {
  const hour = Number(now.toLocaleString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false }))
  return hour < 5 || hour >= 18 ? 'Boa noite' : hour < 12 ? 'Bom dia' : 'Boa tarde'
}

const clip = (text, size) => text.length > size ? `${text.slice(0, size).replace(/\s+\S*$/, '')}…` : text

export function buildBriefing(entries, now = new Date()) {
  const open = entries.filter((entry) => entry.status !== 'concluído')
  const today = localDay(now)
  // A reminder already past is still owed, so it counts until someone closes it.
  const reminders = open.filter((entry) => entry.kind === 'lembrete' && entry.due && localDay(new Date(entry.due)) <= today).length
  const tasks = open.filter((entry) => entry.kind === 'tarefa').length
  const work = open.filter((entry) => ['projeto', 'estudo'].includes(entry.kind) && entry.next.trim())
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))[0]
  const pending = [
    reminders && count(reminders, 'm', 'lembrete', 'lembretes'),
    tasks && count(tasks, 'f', 'tarefa pendente', 'tarefas pendentes'),
  ].filter(Boolean)
  const parts = [`${periodOfDay(now)}.`]
  if (pending.length) parts.push(`Você tem ${pending.join(' e ')}.`)
  if (work) parts.push(`Em ${clip(work.title, 60)}, o próximo passo é ${clip(work.next.trim().replace(/[.!]+$/, ''), 90)}.`)
  return { greeting: periodOfDay(now), reminders, tasks, resume: work ? { title: work.title, next: work.next } : null, line: parts.join(' ') }
}

/** A sentence, or nothing: a slow forecast must never hold the greeting up. */
async function weatherSentence(city, fetcher) {
  if (!city) return ''
  try {
    const { now } = await fetchWeather(city, { fetcher, signal: AbortSignal.timeout(1500) })
    return `Agora faz ${now.temperature} graus, com ${now.condition}.`
  } catch { return '' }
}

export async function handleBriefing(req, res, cors, { memory = assistantMemory, fetcher = fetch, clock = () => new Date() } = {}) {
  const city = new URL(req.url, 'http://localhost').searchParams.get('city')?.trim().slice(0, 120) ?? ''
  const { entries } = await memory.read()
  const briefing = buildBriefing(entries, clock())
  const weather = await weatherSentence(city, fetcher)
  res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ...briefing, line: [briefing.line, weather].filter(Boolean).join(' ') }))
}
