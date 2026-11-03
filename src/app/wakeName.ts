/** The same mishearings voice.ts accepts for the wake word — otherwise a turn
 *  that woke him as "travis" gets that word sent on to the model as a question. */
const NAME = '(?:jarvis|jarvys|jervis|jarviss|jarv|járvis|jarves)'

/** A bare vocative — "Jarvis", "hey jarvis" — with nothing asked. */
export const BARE_NAME = new RegExp(`^(?:oi|olá|ola|ei)?\\s*${NAME}[\\s,.!?]*$`, 'i')

/** A leading vocative on a real command: "Jarvis, what's the weather". */
export const LEADING_NAME = new RegExp(`^(?:oi|olá|ola|ei)?\\s*${NAME}\\b[\\s,.:!?-]*`, 'i')
