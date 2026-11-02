/**
 * Telling the person something before they ask.
 *
 * Plain arithmetic on their calendar, no model involved, so it costs nothing and
 * cannot invent an appointment.
 */

const TIME_ZONE = 'America/Sao_Paulo'
const WARN_BEFORE_MS = 15 * 60000
const DAY_MS = 86400000

const timed = (events) => events.filter((event) => /T/.test(event.start ?? '') && /T/.test(event.end ?? ''))
const day = (date) => date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
const clock = (value) => new Date(value).toLocaleTimeString('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })

/** Starting within the warning, and not already under way. */
export const startingSoon = (events, now) => timed(events).filter((event) => {
  const left = Date.parse(event.start) - now
  return left > 0 && left <= WARN_BEFORE_MS
})

export function findConflicts(events) {
  const ordered = timed(events).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const clashes = []
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length && Date.parse(ordered[j].start) < Date.parse(ordered[i].end); j++) clashes.push([ordered[i], ordered[j]])
  }
  return clashes
}

export function daySentence(events, now = new Date()) {
  const today = timed(events).filter((event) => day(new Date(event.start)) === day(now) && Date.parse(event.end) > now.getTime())
  if (!today.length) return ''
  const first = today.reduce((a, b) => Date.parse(a.start) < Date.parse(b.start) ? a : b)
  const opening = today.length === 1 ? `Hoje você tem ${first.title} às ${clock(first.start)}.` : `Hoje você tem ${today.length} compromissos, o primeiro é ${first.title} às ${clock(first.start)}.`
  const [clash] = findConflicts(today)
  return clash ? `${opening} Atenção: ${clash[0].title} e ${clash[1].title} batem no mesmo horário.` : opening
}

/** What the next day holds, in the shape the calendar asks for. */
export const nextDay = (now = Date.now()) => ({ from: new Date(now).toISOString(), to: new Date(now + DAY_MS).toISOString() })

/** Hands anything about to start to the reminders, which already know how to speak. */
export async function watchCalendar(calendar, memory, now = Date.now()) {
  if (!calendar.connected) return []
  const events = await calendar.events(nextDay(now))
  const soon = startingSoon(events, now)
  for (const event of soon) await memory.announce(`agenda:${event.id}:${event.start}`, `${event.title}, às ${clock(event.start)}`, now)
  return soon
}
