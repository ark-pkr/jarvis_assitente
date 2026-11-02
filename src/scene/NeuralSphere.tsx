import { useEffect, useRef } from 'react'
import { feelingNow, useStore } from '../store'
import { ACCENT, GOLD, MOODS, easeMood, feelingColour, mix, moodFor, neighbours, parseColour, stepSignals, type Mood, type Rgb, type Signal } from './sphereMood'

type Point = { x: number; y: number; z: number }
type ProjectedPoint = { x: number; y: number; z: number }

const pointCount = 220
const connectionDistance = 0.12
const points: Point[] = Array.from({ length: pointCount }, (_, index) => {
  const y = 1 - (index / (pointCount - 1)) * 2
  const radius = Math.sqrt(1 - y * y)
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius }
})
const connections: [number, number][] = []
for (let first = 0; first < points.length; first++) {
  for (let second = first + 1; second < points.length; second++) {
    const dx = points[first].x - points[second].x
    const dy = points[first].y - points[second].y
    const dz = points[first].z - points[second].z
    if (dx * dx + dy * dy + dz * dz < connectionDistance) connections.push([first, second])
  }
}
const near = neighbours(pointCount, connections)

type Frame = { time: number; angle: number; level: number; mood: Mood; colour: Rgb; accent: Rgb; signals: Signal[] }

function paintSphere(context: CanvasRenderingContext2D, width: number, height: number, frame: Frame) {
  const { time, angle, level, mood, signals } = frame
  const lattice = mix(frame.colour, frame.accent, mood.tint)
  const rgba = ([r, g, b]: Rgb, alpha: number, lift = 0) => `rgba(${r}, ${Math.min(255, g + lift)}, ${b}, ${Math.min(alpha, 1)})`
  const centerX = width / 2
  const centerY = height / 2
  // A voice pushes back against the lean of `size`, so listening visibly
  // follows the sentence instead of holding one shrunken pose.
  const movement = Math.min(level, 1)
  const radius = Math.min(width, height) * 0.36 * (mood.size + movement * .13)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const tilt = Math.sin(time * 0.11) * 0.16
  const tiltCosine = Math.cos(tilt)
  const tiltSine = Math.sin(tilt)
  const projected: ProjectedPoint[] = points.map((point) => {
    const x = point.x * cosine + point.z * sine
    const depth = -point.x * sine + point.z * cosine
    const y = point.y * tiltCosine - depth * tiltSine
    const z = point.y * tiltSine + depth * tiltCosine
    const perspective = 1 / (1.14 - z * 0.14)
    let px = x * radius * perspective
    let py = y * radius * perspective
    if (mood.ripple > .01) {
      // Speech leaves the nucleus as a wave through the lattice.
      const distance = Math.hypot(px, py) / radius
      const push = 1 + Math.sin(distance * 9 - time * 7) * .05 * mood.ripple * (.35 + movement * 1.3)
      px *= push
      py *= push
    }
    return { x: centerX + px, y: centerY - py, z }
  })

  context.clearRect(0, 0, width, height)
  context.globalCompositeOperation = 'lighter'

  const beat = mood.signals > .5 ? (Math.sin(time * 5.2) + 1) / 2 : 0
  const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.78)
  core.addColorStop(0, `rgba(255, 242, 205, ${(0.21 + movement * 0.2 + beat * .1) * mood.glow})`)
  core.addColorStop(0.25, rgba(lattice, 0.11 * mood.glow))
  core.addColorStop(1, rgba(lattice, 0))
  context.fillStyle = core
  context.beginPath()
  context.arc(centerX, centerY, radius * 0.78, 0, Math.PI * 2)
  context.fill()

  context.lineWidth = Math.max(0.55, width / 850)
  for (const [first, second] of connections) {
    const start = projected[first]
    const end = projected[second]
    const depth = (start.z + end.z) / 2
    context.strokeStyle = rgba(lattice, (0.055 + Math.max(0, depth) * 0.25 + movement * 0.12) * mood.glow, Math.round((depth + 1) * 26))
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
  }

  for (let index = 0; index < projected.length; index++) {
    const point = projected[index]
    const size = 0.65 + Math.max(0, point.z) * 1.15 + movement * (index % 5 === 0 ? 1.1 : 0.25)
    const alpha = (0.2 + Math.max(0, point.z) * 0.68 + movement * 0.12) * mood.glow
    context.fillStyle = index % 17 === 0
      ? `rgba(255, 244, 208, ${Math.min(alpha + 0.2, 1)})`
      : rgba(lattice, alpha, Math.round(Math.max(0, point.z) * 45))
    if (index % 17 === 0) {
      context.shadowColor = rgba(lattice, .9, 28)
      context.shadowBlur = 9 + movement * 8
    } else {
      context.shadowBlur = 0
    }
    context.beginPath()
    context.arc(point.x, point.y, size, 0, Math.PI * 2)
    context.fill()
  }
  context.shadowBlur = 0

  // Thought: signals running the lattice, brightest at the head.
  context.lineWidth = Math.max(1, width / 520)
  context.shadowColor = rgba(frame.accent, .9)
  context.shadowBlur = 8
  for (const signal of signals) {
    const start = projected[signal.from]
    const end = projected[signal.to]
    const x = start.x + (end.x - start.x) * signal.at
    const y = start.y + (end.y - start.y) * signal.at
    const facing = .3 + Math.max(0, (start.z + end.z) / 2) * .7
    context.strokeStyle = rgba(frame.accent, facing * .8, 20)
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(x, y)
    context.stroke()
    context.fillStyle = `rgba(240, 250, 255, ${facing})`
    context.beginPath()
    context.arc(x, y, Math.max(1.4, width / 300), 0, Math.PI * 2)
    context.fill()
  }
  context.shadowBlur = 0

  // Speech: rings leaving the nucleus. Three, evenly spaced in time, so there
  // is always one on its way out while he is talking.
  if (mood.ripple > .01) {
    context.lineWidth = 1
    for (let ring = 0; ring < 3; ring++) {
      const age = (time * .55 + ring / 3) % 1
      context.strokeStyle = rgba(lattice, (1 - age) * .3 * mood.ripple * (.4 + movement), 40)
      context.beginPath()
      context.arc(centerX, centerY, radius * (.12 + age * 1.04), 0, Math.PI * 2)
      context.stroke()
    }
  }

  context.strokeStyle = rgba(lattice, (0.12 + movement * 0.12) * mood.glow, 20)
  context.lineWidth = 1
  context.beginPath()
  context.ellipse(centerX, centerY, radius * 1.08, radius * 0.29, -0.12, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.ellipse(centerX, centerY, radius * 1.12, radius * 0.34, 0.18, Math.PI * 0.08, Math.PI * 1.02)
  context.stroke()

  // A tool at work: the orbits sweep, like something being scanned.
  if (mood.sweep > .01) {
    context.lineWidth = Math.max(1.4, width / 400)
    context.strokeStyle = rgba(frame.accent, .85 * mood.sweep, 20)
    context.beginPath()
    context.ellipse(centerX, centerY, radius * 1.08, radius * 0.29, -0.12, time * 2.4, time * 2.4 + 1.1)
    context.stroke()
    context.beginPath()
    context.ellipse(centerX, centerY, radius * 1.12, radius * 0.34, 0.18, -time * 1.7, -time * 1.7 + .8)
    context.stroke()
  }

  const nucleusRadius = radius * (0.035 + movement * 0.012 + beat * .008)
  const nucleus = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, nucleusRadius * 5)
  nucleus.addColorStop(0, 'rgba(255, 255, 242, 0.98)')
  nucleus.addColorStop(0.08, rgba(lattice, 0.9, 56))
  nucleus.addColorStop(0.28, rgba(lattice, 0.4))
  nucleus.addColorStop(1, rgba(lattice, 0))
  context.fillStyle = nucleus
  context.beginPath()
  context.arc(centerX, centerY, nucleusRadius * 5, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#fff8dc'
  context.beginPath()
  context.arc(centerX, centerY, nucleusRadius, 0, Math.PI * 2)
  context.fill()
  context.globalCompositeOperation = 'source-over'
}

export function NeuralSphere({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return

    let raf = 0
    let width = 0
    let height = 0
    let previousFrame = 0
    let elapsed = 0
    let angle = 0
    let level = 0
    let mood = MOODS[useStore.getState().phase]
    let tinted: Rgb = GOLD
    let signals: Signal[] = []
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const draw = () => {
      const state = useStore.getState()
      const { phase, ui } = state
      const accent = ACCENT[phase] ?? tinted
      // Asked for a colour, the whole sphere takes it, thought included.
      const chosen = parseColour(ui.reactor.color ?? ui.accent) ?? feelingColour(phase, feelingNow(state))
      paintSphere(context, width, height, { time: elapsed, angle, level, mood, signals, colour: chosen ?? GOLD, accent: chosen ?? accent })
      if (ACCENT[phase]) tinted = ACCENT[phase]
    }
    const resize = () => {
      const bounds = element.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      width = bounds.width
      height = bounds.height
      element.width = Math.round(width * pixelRatio)
      element.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      draw()
    }
    const paint = (now: number) => {
      if (now - previousFrame >= 33) {
        const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.1) : 0
        previousFrame = now
        elapsed += delta
        const state = useStore.getState()
        const { level: target, phase } = state
        const wanted = moodFor(phase, feelingNow(state))
        mood = easeMood(mood, wanted, delta)
        angle += delta * mood.spin
        // The store updates at 15 Hz; easing hides the steps at 30.
        level += (['listening', 'speaking'].includes(phase) ? target - level : -level) * .35
        signals = stepSignals(signals, near, wanted.signals, delta)
        draw()
      }
      if (!reducedMotion && active && !document.hidden) raf = requestAnimationFrame(paint)
    }
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => { reducedMotion = motionPreference.matches }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    motionPreference.addEventListener('change', updateMotion)
    // With motion off the loop stops after one frame, so a change of phase has
    // to ask for its own, or the sphere would stay in the state it started in.
    const phaseChanged = useStore.subscribe((state, previous) => {
      if (reducedMotion && state.phase !== previous.phase) { mood = MOODS[state.phase]; draw() }
    })
    resize()
    raf = requestAnimationFrame(paint)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      motionPreference.removeEventListener('change', updateMotion)
      phaseChanged()
    }
  }, [active])

  return <canvas ref={canvas} className="neural-sphere-canvas" aria-hidden="true" />
}
