/**
 * Reminders said out loud.
 *
 * The notification appears whether or not anyone is looking. Speech is for the
 * moment itself: one that came due while he was off stays a notification, because
 * a list of old reminders read aloud at startup helps nobody.
 */

export type Alert = { id: string; title: string; time: number; say?: string; brief?: boolean }

const FRESH_MS = 10 * 60000
const MOST_AT_ONCE = 3
/** More than enough to outlive the hundred notifications the bridge keeps. */
const REMEMBERED = 200
const KEY = 'jarvis-spoken-alerts'

export function alertsToSpeak(alerts: readonly Alert[], spoken: ReadonlySet<string>, now: number) {
  return alerts.filter((alert) => !spoken.has(alert.id) && now - alert.time < FRESH_MS).slice(0, MOST_AT_ONCE).reverse()
}

export function alertLine(alerts: readonly Alert[]) {
  if (alerts.length === 1) return alerts[0].say ?? `Lembrete: ${alerts[0].title}.`
  return `Você tem ${alerts.length} ${alerts.some((alert) => alert.say) ? 'avisos' : 'lembretes'}. ${alerts.map((alert) => alert.say ?? `${alert.title}.`).join(' ')}`
}

export function loadSpoken(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}

export function saveSpoken(spoken: ReadonlySet<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...spoken].slice(-REMEMBERED))) }
  catch { /* It would be said again at worst, and only within the ten minutes. */ }
}
