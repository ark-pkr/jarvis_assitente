import { useEffect, useState } from 'react'
import { NeuralSphere } from '../scene/NeuralSphere'
import { useStore, type Phase } from '../store'

/**
 * The small sphere in the corner of the screen, while the main window is away.
 *
 * A second window on the same page, and nothing more than a mirror: it holds no
 * conversation, opens no microphone and owns no state. The main window publishes
 * what it is doing and this draws it, so there is only ever one JARVIS.
 */
const LABELS: Partial<Record<Phase, string>> = {
  dormant: 'Em espera',
  listening: 'Ouvindo',
  waking: 'Ouvindo',
  thinking: 'Pensando',
  tooling: 'Trabalhando',
  speaking: 'Falando',
}

export function MiniOrb() {
  const phase = useStore((s) => s.phase)
  const [caption, setCaption] = useState('')
  useEffect(() => window.jarvisDesktop?.onMiniState((state) => {
    useStore.setState({ phase: state.phase as Phase, level: state.level })
    setCaption(state.looking ? `Observando: ${state.looking}` : state.caption)
  }), [])
  return <button className="mini-orb" aria-label="Abrir JARVIS" onClick={() => void window.jarvisDesktop?.openMain()}>
    <NeuralSphere active />
    <span className="mini-label">{caption || LABELS[phase] || ''}</span>
  </button>
}
