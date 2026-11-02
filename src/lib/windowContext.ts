/**
 * What "isso" refers to.
 *
 * Only the name of the program in front and its window title, and only when the
 * person has turned this on and the request plainly points at something. Actually
 * looking at the screen is still a separate step with its own confirmation.
 */

const POINTING = /\b(resum\w*|tradu\w*|expli\w*|corrij\w*|corrig\w*|revis\w*|o que (e|significa|quer dizer)|leia|le)\b.{0,24}\b(isso|isto|esse|essa|este|esta|aqui)\b|\b(esse|essa|este|esta) (erro|tela|janela|texto|pagina|arquivo|codigo|aba|mensagem|planilha|documento)\b|\bisso aqui\b/

/** Short requests only: "isso" in a long sentence is almost never about the screen. */
const SHORT = 9

export function pointsAtSomething(said: string) {
  const text = said.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return text.split(/\s+/).length <= SHORT && POINTING.test(text)
}

export async function windowNote(said: string, allowed: boolean) {
  if (!allowed || !window.jarvisDesktop || !pointsAtSomething(said)) return ''
  try { return await window.jarvisDesktop.activeWindow() }
  catch { return '' }
}
