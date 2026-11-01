// During a reply, only an explicit named interruption may cancel speech.
// Common words such as "não" also occur in JARVIS's own answers.
export function isExplicitInterruption(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(?:(?:oi|ei|ola) )?(?:jarvis|jarves|jervis) (?:pare|parar|espere|cancele|cancelar|silencio|chega)\b/.test(normalized)
}
