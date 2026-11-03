import { useEffect } from 'react'
import { useStore } from '../store'
import { useWorkspace, flushWorkspace } from '../workspace'

/**
 * Keeps the on-screen conversation and the saved session in step: the active
 * session's turns are loaded on start and whenever the user switches session,
 * and every new turn is saved back unless privacy mode is on.
 */
export function useSessionSync(): void {
  useEffect(() => {
    const restore = () => {
      const workspace = useWorkspace.getState()
      useStore.setState({ turns: workspace.sessions.find((s) => s.id === workspace.active)?.turns ?? [], panels: [], blades: [] })
    }
    restore()
    const save = useStore.subscribe((state, previous) => {
      if (state.turns !== previous.turns && !useWorkspace.getState().settings.privacyMode) {
        useWorkspace.getState().saveTurns(state.turns)
      }
    })
    const switched = useWorkspace.subscribe((state, previous) => {
      if (state.active !== previous.active) restore()
    })
    return () => { save(); switched(); flushWorkspace() }
  }, [])
}
