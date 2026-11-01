import { useEffect, useRef } from 'react'
import { useStore, type Phase } from '../store'

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

const rotationSpeed: Record<Phase, number> = {
  offline: 0.08,
  boot: 0.32,
  dormant: 0.1,
  waking: 0.48,
  listening: 0.2,
  thinking: 0.3,
  tooling: 0.38,
  speaking: 0.24,
}

function paintSphere(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  level: number,
  phase: Phase,
) {
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.36
  const movement = ['listening', 'speaking'].includes(phase) ? Math.min(level, 1) : 0
  const angle = time * rotationSpeed[phase]
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
    return {
      x: centerX + x * radius * perspective,
      y: centerY - y * radius * perspective,
      z,
    }
  })

  context.clearRect(0, 0, width, height)
  context.globalCompositeOperation = 'lighter'

  const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.78)
  core.addColorStop(0, `rgba(255, 242, 205, ${0.21 + movement * 0.2})`)
  core.addColorStop(0.25, 'rgba(255, 166, 58, 0.11)')
  core.addColorStop(1, 'rgba(255, 130, 32, 0)')
  context.fillStyle = core
  context.beginPath()
  context.arc(centerX, centerY, radius * 0.78, 0, Math.PI * 2)
  context.fill()

  context.lineWidth = Math.max(0.55, width / 850)
  for (const [first, second] of connections) {
    const start = projected[first]
    const end = projected[second]
    const depth = (start.z + end.z) / 2
    context.strokeStyle = `rgba(255, ${158 + Math.round((depth + 1) * 43)}, 72, ${0.055 + Math.max(0, depth) * 0.25 + movement * 0.12})`
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
  }

  for (let index = 0; index < projected.length; index++) {
    const point = projected[index]
    const size = 0.65 + Math.max(0, point.z) * 1.15 + movement * (index % 5 === 0 ? 1.1 : 0.25)
    const alpha = 0.2 + Math.max(0, point.z) * 0.68 + movement * 0.12
    context.fillStyle = index % 17 === 0
      ? `rgba(255, 244, 208, ${Math.min(alpha + 0.2, 1)})`
      : `rgba(255, ${171 + Math.round(Math.max(0, point.z) * 45)}, 78, ${Math.min(alpha, 1)})`
    if (index % 17 === 0) {
      context.shadowColor = '#ffc66f'
      context.shadowBlur = 9 + movement * 8
    } else {
      context.shadowBlur = 0
    }
    context.beginPath()
    context.arc(point.x, point.y, size, 0, Math.PI * 2)
    context.fill()
  }
  context.shadowBlur = 0

  context.strokeStyle = `rgba(255, 191, 105, ${0.12 + movement * 0.12})`
  context.lineWidth = 1
  context.beginPath()
  context.ellipse(centerX, centerY, radius * 1.08, radius * 0.29, -0.12, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.ellipse(centerX, centerY, radius * 1.12, radius * 0.34, 0.18, Math.PI * 0.08, Math.PI * 1.02)
  context.stroke()

  const nucleusRadius = radius * (0.035 + movement * 0.012)
  const nucleus = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, nucleusRadius * 5)
  nucleus.addColorStop(0, 'rgba(255, 255, 242, 0.98)')
  nucleus.addColorStop(0.08, 'rgba(255, 227, 166, 0.9)')
  nucleus.addColorStop(0.28, 'rgba(255, 157, 56, 0.4)')
  nucleus.addColorStop(1, 'rgba(255, 126, 35, 0)')
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

    let frame = 0
    let width = 0
    let height = 0
    let previousFrame = 0
    let elapsed = 0
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const resize = () => {
      const bounds = element.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      width = bounds.width
      height = bounds.height
      element.width = Math.round(width * pixelRatio)
      element.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      paintSphere(context, width, height, elapsed, 0, useStore.getState().phase)
    }
    const paint = (now: number) => {
      if (now - previousFrame >= 33) {
        const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.1) : 0
        previousFrame = now
        elapsed += delta
        const { level, phase } = useStore.getState()
        paintSphere(context, width, height, elapsed, level, phase)
      }
      if (!reducedMotion && active && !document.hidden) frame = requestAnimationFrame(paint)
    }
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => { reducedMotion = motionPreference.matches }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    motionPreference.addEventListener('change', updateMotion)
    resize()
    frame = requestAnimationFrame(paint)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      motionPreference.removeEventListener('change', updateMotion)
    }
  }, [active])

  return <canvas ref={canvas} className="neural-sphere-canvas" aria-hidden="true" />
}
