import { setCinema, useCinema } from '../lib/cinema'

export type ShortcutActions = {
  /** V — audition the next installed voice. */
  nextVoice: () => void
  /** T — speak a fixed line to tell a broken voice engine from a broken voice loop. */
  testAudio: () => void
  /** Esc, when not leaving cinema mode — stand the whole thing down. */
  standDown: () => void
  /** Space — start a turn without the wake word. */
  activate: () => void
}

const plain = (e: KeyboardEvent) => !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey

const typing = (target: HTMLElement | null, extra: string[] = []) =>
  ['INPUT', 'TEXTAREA', 'SELECT', ...extra].includes(target?.tagName ?? '') || Boolean(target?.isContentEditable)

/**
 * The keyboard shortcuts. Returns the keydown handler, so the caller decides
 * when it is attached; none of them fire while the user is typing in a field.
 */
export function createShortcutHandler(actions: ShortcutActions): (e: KeyboardEvent) => void {
  return (e) => {
    const target = e.target as HTMLElement | null
    // Above the check below: a button keeps the focus after a click, and the key means nothing to it.
    if (e.key.toLowerCase() === 'c' && plain(e) && !typing(target)) {
      e.preventDefault()
      setCinema(!useCinema.getState().on)
      return
    }
    if (typing(target, ['BUTTON'])) return

    // Bare V only — Ctrl+V is paste, and swallowing it would be rude.
    if (e.key === 'v' && plain(e)) {
      e.preventDefault()
      actions.nextVoice()
      return
    }

    if (e.key === 't' && plain(e)) {
      e.preventDefault()
      actions.testAudio()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      if (useCinema.getState().on) setCinema(false)
      else actions.standDown()
      return
    }

    // Worth using while filming, so a missed wake word doesn't cost a take.
    if (e.code !== 'Space' || e.repeat) return
    e.preventDefault()
    actions.activate()
  }
}
