/** "Jarvis, encerrar aula", and the other ways of saying it. Right next to each other: "para a próxima aula" ends nothing. */
const ENDS = /\b(encerr\w*|termin\w*|finaliz\w*|acab\w*|par[ae]r?|sai[ar])\s+((a|o|da|do|essa|esta|modo)\s+)*(aula|gravacao)\b|\bfim da aula\b/
export const endsLecture = (said: string) => ENDS.test(said.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
