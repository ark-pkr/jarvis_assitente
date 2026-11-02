import { assistantMemory } from './assistant.mjs'
import { fetchWeather } from './daily.mjs'
import { fromEnvironment } from './calendar.mjs'
import { daySentence, nextDay } from './foresight.mjs'
import { quiz } from './quiz.mjs'
import { learned } from './learned.mjs'
import { openingRemark, rapport } from './rapport.mjs'

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

export function buildBriefing(entries, now = new Date(), events = [], reviews = 0, remark = '', followup = '') {
  const open = entries.filter((entry) => entry.status !== 'concluído')
  const date = localDay(now)
  // A reminder already past is still owed, so it counts until someone closes it.
  const reminders = open.filter((entry) => entry.kind === 'lembrete' && entry.due && localDay(new Date(entry.due)) <= date).length
  const tasks = open.filter((entry) => entry.kind === 'tarefa').length
  const work = open.filter((entry) => ['projeto', 'estudo'].includes(entry.kind) && entry.next.trim())
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))[0]
  const pending = [
    reminders && count(reminders, 'm', 'lembrete', 'lembretes'),
    tasks && count(tasks, 'f', 'tarefa pendente', 'tarefas pendentes'),
  ].filter(Boolean)
  const opening = [`${periodOfDay(now)}.`, remark].filter(Boolean).join(' ')
  const parts = [opening]
  if (pending.length) parts.push(`Você tem ${pending.join(' e ')}.`)
  const today = daySentence(events, now)
  if (today) parts.push(today)
  if (followup) parts.push(followup)
  if (reviews) parts.push(`Há ${count(reviews, 'f', 'pergunta', 'perguntas')} da prova oral para revisar.`)
  if (work) parts.push(`Em ${clip(work.title, 60)}, o próximo passo é ${clip(work.next.trim().replace(/[.!]+$/, ''), 90)}.`)
  return { greeting: periodOfDay(now), opening, reminders, tasks, resume: work ? { title: work.title, next: work.next } : null, line: parts.join(' ') }
}

/** A sentence, or nothing: a slow forecast must never hold the greeting up. */
async function weatherSentence(city, fetcher) {
  if (!city) return ''
  try {
    const { now } = await fetchWeather(city, { fetcher, signal: AbortSignal.timeout(1500) })
    return `Agora faz ${now.temperature} graus, com ${now.condition}.`
  } catch { return '' }
}

/** The same promise as the weather: a slow calendar never holds the greeting up. */
async function todaysEvents(calendar, now) {
  if (!calendar.connected) return []
  try { return await calendar.events(nextDay(now.getTime()), AbortSignal.timeout(1500)) }
  catch { return [] }
}

export async function handleBriefing(req, res, cors, { memory = assistantMemory, fetcher = fetch, clock = () => new Date(), calendar = fromEnvironment(), exams = quiz, notes = learned, friend = rapport } = {}) {
  const query = new URL(req.url, 'http://localhost').searchParams
  const city = query.get('city')?.trim().slice(0, 120) ?? ''
  const { entries } = await memory.read()
  const now = clock()
  const reviews = await exams.reviewsDue(now.getTime()).catch(() => 0)
  const remark = query.get('formal') === '1' ? '' : openingRemark({ now: now.getTime(), lastSeen: (await friend.read().catch(() => ({}))).lastSeen })
  // Only the full briefing carries it, and asked once it is gone.
  const [followup] = query.get('first') === '1' && query.get('learn') === '1' ? notes.followupsDue(await notes.read().catch(() => ({ followups: [] })), now.getTime()) : []
  if (followup) await notes.followupAsked(followup.id).catch(() => {})
  void friend.seen(now.getTime()).catch(() => {})
  const briefing = buildBriefing(entries, now, await todaysEvents(calendar, now), reviews, remark, followup?.ask)
  const weather = await weatherSentence(city, fetcher)
  res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ...briefing, line: [briefing.line, weather].filter(Boolean).join(' ') }))
}
