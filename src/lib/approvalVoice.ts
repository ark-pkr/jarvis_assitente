/**
 * Answering a confirmation out loud.
 *
 * The wording is the safety here, because a microphone beside a loudspeaker hears
 * its own side of the conversation. The question never contains a word that counts
 * as an answer, so a question that leaks back in cannot approve itself. And an
 * answer has to be the whole utterance: "sim, mas antes me explica" is a person
 * still thinking, and nothing that matters is settled by finding "sim" in a sentence.
 */

export type Answer = 'yes' | 'no'

const WORDS_IN_QUESTION = 90

/** Spoken and shown. Keep "sim", "pode" and the like out of it. See above. */
export const approvalQuestion = (action: string) => `${action.trim().slice(0, WORDS_IN_QUESTION)}. Posso seguir?`

export const ASK_AGAIN = 'Não entendi. Posso seguir com isso?'

/** Any of these and the answer is no: a doubt never turns into a yes. */
const REFUSE = new Set(['nao', 'cancela', 'cancelar', 'cancele', 'cancelado', 'negativo', 'nunca', 'pare', 'para', 'parar', 'espera', 'espere', 'aguarde'])
/** Each of these is an answer by itself. */
const AGREE = new Set(['sim', 'pode', 'confirmo', 'confirma', 'confirmado', 'autorizo', 'autoriza', 'autorizado', 'segue', 'siga', 'continua', 'continue', 'ok', 'okay'])
/** Allowed around an answer, and no answer alone. */
const AROUND = new Set(['seguir', 'continuar', 'fazer', 'faz', 'faca', 'ir', 'claro', 'isso', 'por', 'favor', 'senhor', 'jarvis'])

/** Beyond this it is a sentence, not an answer. */
const SHORT_ANSWER = 5
/** A refusal gets more room: wrongly stopping costs far less than wrongly going. */
const SHORT_REFUSAL = 8

export function readAnswer(said: string): Answer | null {
  const words = said.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (!words.length) return null
  if (words.length <= SHORT_REFUSAL && words.some((word) => REFUSE.has(word))) return 'no'
  if (words.length > SHORT_ANSWER) return null
  const agreed = words.some((word) => AGREE.has(word))
  return agreed && words.every((word) => AGREE.has(word) || AROUND.has(word)) ? 'yes' : null
}
