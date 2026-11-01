const UNCLEAR_MARKER = '[trecho incerto]'

export function splitUnclearTranscript(text: string): { before: string; after: string } | null {
  const normalised = text.toLocaleLowerCase('pt-BR')
  const at = normalised.indexOf(UNCLEAR_MARKER)
  if (at < 0 || normalised.indexOf(UNCLEAR_MARKER, at + UNCLEAR_MARKER.length) >= 0) return null
  return { before: text.slice(0, at), after: text.slice(at + UNCLEAR_MARKER.length) }
}

export function mergeClarification(parts: { before: string; after: string }, replacement: string): string {
  return `${parts.before}${replacement}${parts.after}`.replace(/\s+/g, ' ').trim()
}
