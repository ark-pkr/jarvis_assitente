/**
 * Hearing his name. No imports, so it can be tested on its own.
 */

/**
 * His name, and the only wake phrase.
 *
 * The optional prefix is genuinely optional: addressing him by name alone is
 * correct, and during an answer "Jarvis" on its own is the natural way to cut
 * in. The negative lookahead keeps possessives ("Jarvis's job") from waking him.
 *
 * The alternates are not padding. "Jarvis" is not in a general dictation
 * model's high-frequency vocabulary, and Chrome routinely returns Travis,
 * Jervis, Jarvys or Java's for a perfectly clear utterance — every one of which
 * used to be silently discarded, so the wake word "just didn't work" with no
 * indication why. Better a rare false wake than a name that does not answer.
 */
export const WAKE =
  /\b(?:oi|olá|ola|ei)?\s*(?:jarvis|jarvys|jervis|jarviss|jarv|járvis|jarves)\b/i

/**
 * Whether the name is being used to call him, not just mentioned.
 *
 * People call with the name at the edge of a sentence: "Jarvis, abre o Word",
 * "ô Jarvis, que horas são", "abre o Word, Jarvis". In the middle it is talk
 * about him ("esse é o tal do Jarvis que você falou"), and in a shop that
 * sentence came from a customer and got an answer. The transcriber is also told
 * the name matters so it does not miss it, which makes it hear "Jarvis" in
 * words that only sound close. Requiring the edge of a sentence keeps the real
 * calls and drops most of both. Sentences are split on their punctuation, so
 * one recording holding a customer's sentence and then a call still counts.
 */
export function calledByName(text: string): boolean {
  for (const sentence of text.split(/[.!?…;]+/)) {
    const m = WAKE.exec(sentence)
    if (!m) continue
    const words = (part: string) => part.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).length
    if (words(sentence.slice(0, m.index)) <= 2 || words(sentence.slice(m.index + m[0].length)) <= 1) return true
  }
  return false
}

/** Everything after the wake phrase, which is usually the actual command. */
export function afterWake(text: string): string {
  const m = WAKE.exec(text)
  if (!m) return ''
  return text
    .slice(m.index + m[0].length)
    .replace(/^[\s,.:;!?-]+/, '')
    .trim()
}
