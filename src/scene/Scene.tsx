import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useWorkspace, type HeliosSettings } from '../workspace'
import { accentFor, useStore } from '../store'
import { NeuralSphere } from './NeuralSphere'
export type { Drive } from './DetailedScene'

// Load WebGL only if the user opts into the full visual effects.
const Detailed = lazy(() => import('./DetailedScene').then((module) => ({ default: module.DetailedScene })))

function LightScene({ active }: { active: boolean }) {
  const phase = useStore((state) => state.phase)
  const ui = useStore((state) => state.ui)
  const visualTheme = useWorkspace((state) => state.settings.visualTheme)
  const embers = useMemo(() => visualTheme === 'reactor' ? Array.from({ length: 320 }, (_, index) => {
    const random = (salt: number) => {
      const value = Math.sin((index + 1) * salt) * 43758.5453
      return value - Math.floor(value)
    }
    return {
      angle: `${random(12.9898) * 360}deg`,
      radius: `${6 + random(78.233) * 45}cqw`,
      size: `${1 + random(39.425) * 2.6}px`,
      delay: `${-random(22.14) * 4}s`,
      opacity: `${0.35 + random(17.31) * 0.65}`,
      color: random(57.583) > 0.78 ? '#ffe4a0' : '#ff9636',
      streak: index % 8 === 0,
    }
  }) : [], [visualTheme])
  return <div className="scene scene-light" data-paused={!active} data-theme={visualTheme} aria-hidden="true" style={{
    ['--reactor-color' as string]: ui.reactor.color || accentFor(phase, ui),
    ['--reactor-scale' as string]: ui.reactor.scale,
  }}>
    <div className="holo-grid" />
    {ui.reactor.visible && visualTheme === 'sphere' ? <div className={`neural-sphere light-reactor-${phase}`}>
      <NeuralSphere active={active} />
      <div className="sphere-readout"><small>CAMPO NEURAL</small><b>{phase === 'speaking' ? 'RESPONDENDO' : ['thinking', 'tooling'].includes(phase) ? 'PROCESSANDO' : phase === 'listening' ? 'ESCUTA ATIVA' : 'J.A.R.V.I.S.'}</b>
        <div className="sphere-wave">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ animationDelay: `${i * -.16}s` }} />)}</div>
      </div>
    </div> : ui.reactor.visible && <div className={`light-reactor light-reactor-${phase}`}>
      <div className="holo-particles" />
      <div className="holo-ticks" /><div className="light-ring outer" />
      <div className="holo-orbit" /><div className="light-ring inner" />
      <div className="holo-reticle" /><div className="light-reactor-core" />
      <div className="ember-field">{embers.map((ember, index) => <i
        key={index}
        className={ember.streak ? 'ember-streak' : undefined}
        style={{
          ['--spark-angle' as string]: ember.angle,
          ['--spark-radius' as string]: ember.radius,
          ['--spark-size' as string]: ember.size,
          ['--spark-delay' as string]: ember.delay,
          ['--spark-opacity' as string]: ember.opacity,
          ['--spark-color' as string]: ember.color,
        } as CSSProperties}
      />)}</div>
      <svg className="reactor-engineering" viewBox="0 0 600 600">
        <defs><radialGradient id="core-light"><stop stopColor="#fff8d8"/><stop offset=".14" stopColor="#ffd46a"/><stop offset=".48" stopColor="#f07822" stopOpacity=".72"/><stop offset="1" stopColor="#421506" stopOpacity="0"/></radialGradient><linearGradient id="reactor-metal" x2="0" y2="1"><stop stopColor="#ffd486"/><stop offset=".4" stopColor="#5a2a12"/><stop offset="1" stopColor="#c57a37"/></linearGradient></defs>
        <circle cx="300" cy="300" r="279" fill="none" stroke="url(#reactor-metal)" strokeWidth="13"/>
        <circle cx="300" cy="300" r="261" fill="none" stroke="currentColor" strokeWidth="1"/>
        <circle className="reactor-segments" cx="300" cy="300" r="240" fill="none" stroke="currentColor" strokeWidth="17" strokeDasharray="4 21"/>
        <circle cx="300" cy="300" r="213" fill="none" stroke="#ffbf5b" strokeWidth="2" strokeDasharray="60 8 4 8"/>
        <circle cx="300" cy="300" r="187" fill="#160903" stroke="url(#reactor-metal)" strokeWidth="18"/>
        <circle cx="300" cy="300" r="163" fill="url(#core-light)"/>
        <circle cx="300" cy="300" r="144" fill="none" stroke="#ffd982" strokeWidth="1" strokeDasharray="2 8" opacity=".8"/>
        {Array.from({ length: 24 }, (_, i) => <path key={i} transform={`rotate(${i * 15} 300 300)`} d="M297 84 L303 84 L301 104 L299 104 Z" fill="#ffc76d" opacity={i % 3 === 0 ? '.9' : '.38'}/>)}
        {[0, 90, 180, 270].map((angle) => <g key={angle} transform={`rotate(${angle} 300 300)`}><rect x="288" y="14" width="24" height="12" rx="2" fill="#ffd58d"/><path d="M300 36 V62" stroke="#e9a754" strokeWidth="2"/></g>)}
      </svg>
      <div className="holo-readout"><small>NÚCLEO NEURAL</small><b>{phase === 'speaking' ? 'RESPOSTA' : ['thinking', 'tooling'].includes(phase) ? 'RACIOCÍNIO' : phase === 'listening' ? 'ESCUTA ATIVA' : 'J.A.R.V.I.S.'}</b>
        <div className="holo-wave">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ animationDelay: `${i * -.16}s` }} />)}</div>
      </div>
    </div>}
  </div>
}

export function Scene() {
  const light = useWorkspace((state) => state.settings.lightVisuals)
  const visualTheme = useWorkspace((state) => state.settings.visualTheme)
  const heliosFrame = useRef<HTMLIFrameElement>(null)
  const [active, setActive] = useState(!document.hidden)
  useEffect(() => {
    const update = () => setActive(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (visualTheme !== 'helios') return
    const frame = heliosFrame.current
    let lastLevelAt = 0
    const sendState = (force = false) => {
      const current = useStore.getState()
      const settings = useWorkspace.getState().settings.helios
      const now = performance.now()
      if (!force && now - lastLevelAt < 50) return
      lastLevelAt = now
      heliosFrame.current?.contentWindow?.postMessage({
        channel: 'jarvis-helios',
        type: 'state',
        phase: current.phase,
        level: current.level,
        visible: !document.hidden,
        settings,
      }, window.location.origin)
    }
    const loaded = () => sendState(true)
    const visibilityChanged = () => sendState(true)
    frame?.addEventListener('load', loaded)
    document.addEventListener('visibilitychange', visibilityChanged)
    const unsubscribeStore = useStore.subscribe((state, previous) => {
      if (state.phase !== previous.phase || state.level !== previous.level) sendState()
    })
    const unsubscribeWorkspace = useWorkspace.subscribe((state, previous) => {
      if (state.settings.helios !== previous.settings.helios) sendState(true)
    })
    sendState(true)
    return () => {
      frame?.removeEventListener('load', loaded)
      document.removeEventListener('visibilitychange', visibilityChanged)
      unsubscribeStore()
      unsubscribeWorkspace()
    }
  }, [visualTheme])
  useEffect(() => {
    if (visualTheme !== 'helios') return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== heliosFrame.current?.contentWindow) return
      const data = event.data as { channel?: unknown; type?: unknown; settings?: Partial<HeliosSettings> } | null
      if (data?.channel !== 'jarvis-helios' || data.type !== 'settings' || !data.settings || typeof data.settings !== 'object') return
      const value = data.settings
      const patch: Partial<HeliosSettings> = {}
      if (typeof value.paused === 'boolean') patch.paused = value.paused
      if (typeof value.speed === 'number' && Number.isFinite(value.speed)) patch.speed = Math.max(0, Math.min(3, value.speed))
      if (typeof value.glow === 'number' && Number.isFinite(value.glow)) patch.glow = Math.max(.3, Math.min(2, value.glow))
      if (typeof value.separation === 'number' && Number.isFinite(value.separation)) patch.separation = Math.max(0, Math.min(1, value.separation))
      if (['gold', 'cyan', 'violet', 'emerald', 'rose'].includes(String(value.color))) patch.color = value.color
      if (['auto', 'eco', 'balanced', 'ultra'].includes(String(value.quality))) patch.quality = value.quality
      if (typeof value.bloom === 'boolean') patch.bloom = value.bloom
      if (typeof value.autoRotate === 'boolean') patch.autoRotate = value.autoRotate
      if (typeof value.introOnStartup === 'boolean') patch.introOnStartup = value.introOnStartup
      if (typeof value.cinema === 'boolean') patch.cinema = value.cinema
      if (Number.isInteger(value.introSequence) && Number(value.introSequence) >= 0) patch.introSequence = value.introSequence
      if (Object.keys(patch).length) useWorkspace.getState().setSettings({ helios: patch })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [visualTheme])
  if (visualTheme === 'helios') return <iframe
    ref={heliosFrame}
    className="scene helios-scene"
    title="Holograma do reator HELIOS"
    src="/holograma_3d_reator_helios_v4_1_cinematic.html?embedded=1"
    allow="fullscreen; microphone 'none'; camera 'none'"
    hidden={!active}
  />
  if (light) return <LightScene active={active} />
  return <Suspense fallback={<LightScene active={active} />}><Detailed active={active} /></Suspense>
}
