import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataDirectory, replaceFile } from './paths.mjs'

/**
 * Being someone who noticed you were gone.
 *
 * All of it is arithmetic on dates and saved records, so it costs no model call and
 * cannot invent anything. Speaking first is rationed hard: once a day, in waking
 * hours, only while the person is around and not in the middle of something. An
 * assistant that keeps starting conversations stops being company and becomes noise.
 */

const TIME_ZONE = 'America/Sao_Paulo'
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const AWAKE_FROM = 9
const AWAKE_UNTIL = 21
/** Long enough not to break into a thought, short enough that someone is still there. */
const QUIET_FOR_MS = 10 * MINUTE
const AROUND_WITHIN_MS = 4 * HOUR
const STALE_DAYS = 3
const SAME_NUDGE_DAYS = 7
const SEEN_EVERY_MS = 5 * MINUTE

const NUMBERS = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']
const AT_HOURS = ['à meia-noite', 'à uma da manhã', 'às duas da manhã', 'às três da manhã', 'às quatro da manhã']
const pickOne = (options, random) => options[Math.floor(random() * options.length)]
const dayOf = (time) => new Date(time).toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
const hourOf = (time) => Number(new Date(time).toLocaleString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false })) % 24

/** Hello, and whatever is worth remarking on. Nothing, most of the time. */
export function openingRemark({ now, lastSeen, random = Math.random }) {
  const days = lastSeen ? Math.floor((now - lastSeen) / DAY) : 0
  if (days >= 2) {
    const count = `${NUMBERS[days - 1] ?? days} dias`
    return pickOne([`Sumiu, hein? Faz ${count}.`, `Faz ${count} que a gente não se fala.`, `Quanto tempo! Foram ${count}.`], random)
  }
  const hour = hourOf(now)
  if (hour < 5) return pickOne([`Ainda de pé ${AT_HOURS[hour]}?`, `${AT_HOURS[hour][0].toUpperCase()}${AT_HOURS[hour].slice(1)}? Essa noite tá longa.`], random)
  return ''
}

export class Rapport {
  constructor(directory = dataDirectory) { this.file = path.join(directory, 'rapport.json'); this.queue = Promise.resolve(); this.written = 0 }
  async read() {
    try { return { lastSeen: 0, lastNudgeDay: '', nudged: {}, ...JSON.parse(await fs.readFile(this.file, 'utf8')) } }
    catch (error) { if (error.code === 'ENOENT') return { lastSeen: 0, lastNudgeDay: '', nudged: {} }; throw error }
  }
  mutate(change) {
    const next = this.queue.then(async () => {
      const state = await this.read()
      const result = await change(state)
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.${randomUUID()}.tmp`
      await fs.writeFile(temp, JSON.stringify(state), { flag: 'wx' })
      await replaceFile(temp, this.file)
      return result
    })
    this.queue = next.catch(() => {})
    return next
  }
  /** Every request passes here, and the disk only needs to know roughly. */
  seen(now = Date.now()) {
    if (now - this.written < SEEN_EVERY_MS) return Promise.resolve()
    this.written = now
    return this.mutate((state) => { state.lastSeen = now })
  }
}

export const rapport = new Rapport()

/** What, if anything, is worth saying unprompted right now. Marks nothing. */
export function pickNudge({ followups, entries, state, now }) {
  const hour = hourOf(now)
  if (hour < AWAKE_FROM || hour >= AWAKE_UNTIL || state.lastNudgeDay === dayOf(now)) return null
  if (!state.lastSeen || now - state.lastSeen < QUIET_FOR_MS || now - state.lastSeen > AROUND_WITHIN_MS) return null
  const [followup] = followups
  if (followup) return { key: `followup:${followup.id}`, followup, say: followup.ask }
  const stale = entries
    .filter((entry) => ['projeto', 'estudo'].includes(entry.kind) && entry.status !== 'concluído' && entry.next?.trim() && now - (entry.updated ?? now) >= STALE_DAYS * DAY)
    .filter((entry) => now - (state.nudged[entry.id] ?? 0) >= SAME_NUDGE_DAYS * DAY)
    .sort((a, b) => b.updated - a.updated)[0]
  if (!stale) return null
  const days = Math.floor((now - stale.updated) / DAY)
  return { key: stale.id, say: `Faz ${NUMBERS[days - 1] ?? days} dias que você não mexe em ${stale.title}. Quer retomar?` }
}

export async function handleNudge(req, res, cors, { memory, notes, friend = rapport, clock = Date.now }) {
  const now = clock()
  const nudge = pickNudge({ followups: notes.followupsDue(await notes.read(), now), entries: (await memory.read()).entries, state: await friend.read(), now })
  if (nudge) {
    await friend.mutate((state) => { state.lastNudgeDay = dayOf(now); state.nudged[nudge.key] = now })
    if (nudge.followup) await notes.followupAsked(nudge.followup.id)
  }
  res.writeHead(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ say: nudge?.say ?? '' }))
}
