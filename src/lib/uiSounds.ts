import { useWorkspace } from '../workspace'
import { play } from './sfx'

type InterfaceCue = 'tap' | 'open' | 'close' | 'mode'

export function interfaceCue(cue: InterfaceCue) {
  if (useWorkspace.getState().settings.uiSounds) play(cue)
}

/** One listener instead of a sound on every button, so a new one needs nothing to join in. */
export function watchInterfaceSounds() {
  const tapped = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.('button, select, input[type="checkbox"]')) interfaceCue('tap')
  }
  document.addEventListener('click', tapped, true)
  return () => document.removeEventListener('click', tapped, true)
}
