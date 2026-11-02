import { useEffect, useState } from 'react'
import { BRIDGE_HTTP_URL } from '../config'
import { useStore } from '../store'

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const cancelTimer = (id: string) => {
  useStore.getState().setTimers(useStore.getState().timers.filter((timer) => timer.id !== id))
  void fetch(`${BRIDGE_HTTP_URL}/assistant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancelTimer', id }) }).catch(() => {})
}

/** What is running on its own: a countdown, or a class being written down. */
export function StudyChips() {
  const timers = useStore((s) => s.timers)
  const lecture = useStore((s) => s.lecture)
  const [now, setNow] = useState(Date.now)
  const running = timers.length > 0 || lecture !== null
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [running])
  if (!running) return null
  return <div className="study-chips">
    {lecture && <div className="study-chip recording" role="status">AULA <b>{clock(now - lecture.started)}</b><button onClick={() => window.dispatchEvent(new Event('jarvis:end-lecture'))}>Encerrar</button></div>}
    {timers.map((timer) => <div className="study-chip" key={timer.id} role="timer">{timer.title.toUpperCase()} <b>{clock(timer.ends - now)}</b><button aria-label={`Cancelar ${timer.title}`} onClick={() => cancelTimer(timer.id)}>✕</button></div>)}
  </div>
}
