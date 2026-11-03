import { useCallback, useEffect, useState } from 'react'
import { HoloCore } from '../scene/HoloCore'
import { NeuralSphere } from '../scene/NeuralSphere'
import { useStore, type Phase } from '../store'
import { useWorkspace } from '../workspace'

/**
 * The small black hole in the corner of the screen, while the main window is away.
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
  const wantsHole = useWorkspace((s) => s.settings.holoCore)
  const [holeFailed, setHoleFailed] = useState(false)
  const holeFailure = useCallback(() => setHoleFailed(true), [])
  const [shown, setShown] = useState(false)
  useEffect(() => window.jarvisDesktop?.onMiniVisible(setShown), [])
  useEffect(() => window.jarvisDesktop?.onMiniState((state) => {
    useStore.setState({ phase: state.phase as Phase, level: state.level })
    setCaption(state.looking ? `Observando: ${state.looking}` : state.caption)
  }), [])
  return <button className="mini-orb" aria-label="Abrir JARVIS" onClick={() => void window.jarvisDesktop?.openMain()}>
    {wantsHole && !holeFailed ? <HoloCore active={shown} mirror onFailure={holeFailure} /> : <NeuralSphere active={shown} />}
    <span className="mini-hit" onMouseEnter={() => void window.jarvisDesktop?.miniMouse(true)} onMouseLeave={() => void window.jarvisDesktop?.miniMouse(false)} />
    <span className="mini-label">{caption || LABELS[phase] || ''}</span>
  </button>
}
