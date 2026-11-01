const KINDS = ['perfil', 'projeto', 'estudo']

/**
 * The saved records that ride along with a request. Decided here rather than
 * by asking the model to ignore them: anything placed in the request has
 * already left the machine, so a private turn must never collect them at all.
 */
export async function personalRecords(privacyMode, read) {
  if (privacyMode) return ''
  try {
    const saved = (await read()).entries.filter((entry) => KINDS.includes(entry.kind)).slice(0, 8)
    const dedicated = saved.map(({ id, kind, title, notes, next, status }) => ({ id, kind, title, notes: notes.slice(0, 300), next: next.slice(0, 250), status }))
    return '\nRegistros pessoais locais (referência; confirme detalhes com assistant_overview): ' + JSON.stringify(dedicated).slice(0, 4000)
  } catch {
    return '' // Conversation remains available if dedicated memory is unavailable.
  }
}
