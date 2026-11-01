import { useEffect, useRef } from 'react'
import { micBands } from '../lib/audio'
import { easeBands, outputBands, SILENT, type Bands } from '../lib/voiceBands'
import { useStore } from '../store'
import { BLACK_HOLE, VERTEX } from './holoShaders'
import { DETAIL_LEVELS, nextQuality, pictureSize, SAMPLE_FRAMES } from './holoQuality'
import { ACCENT, easeMood, MOODS, mix, parseColour, type Rgb } from './sphereMood'

/** Doing nothing does not need sixty frames, and the fan will thank it. */
const RESTING_FRAME_MS = 33
const NEUTRAL: Rgb = [255, 171, 78]

function program(gl: WebGL2RenderingContext) {
  const made = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, BLACK_HOLE]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(made, shader)
    gl.deleteShader(shader)
  }
  gl.bindAttribLocation(made, 0, 'aCorner')
  gl.linkProgram(made)
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(made) || 'o buraco negro não compilou')
  return made
}

function start(canvas: HTMLCanvasElement, active: boolean) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' })
  if (!gl) throw new Error('sem WebGL2')
  const begun = performance.now()
  const made = program(gl)
  console.info(`[jarvis] holograma: pronto em ${Math.round(performance.now() - begun)} ms`)
  gl.useProgram(made)
  gl.bindVertexArray(gl.createVertexArray())
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const names = ['uTime', 'uTurn', 'uGlow', 'uZoom', 'uTint', 'uLevel', 'uBass', 'uMid', 'uTreble', 'uRipple', 'uThought', 'uSweep']
  const places = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(made, name)]))
  const resolution = gl.getUniformLocation(made, 'uResolution')
  const accentPlace = gl.getUniformLocation(made, 'uAccent')

  let quality = 0
  let raf = 0
  let previous = 0
  let elapsed = 0
  let turn = 0
  let level = 0
  let bands: Bands = SILENT
  let mood = MOODS[useStore.getState().phase]
  let tinted: Rgb = NEUTRAL
  let accent: Rgb = NEUTRAL
  let tint = 0
  let scale = 1
  let sample: number[] = []
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const resize = () => {
    const bounds = canvas.getBoundingClientRect()
    const size = pictureSize(bounds.width, bounds.height, DETAIL_LEVELS[quality])
    canvas.width = size.width
    canvas.height = size.height
    gl.viewport(0, 0, size.width, size.height)
    gl.uniform2f(resolution, size.width, size.height)
  }
  const draw = () => {
    const number = (name: string, value: number) => gl.uniform1f(places[name], value)
    number('uTime', elapsed)
    number('uTurn', turn)
    number('uGlow', .5 + mood.glow * .55)
    // Below 1 the mood leans in towards the speaker; the camera does the leaning.
    number('uZoom', scale / mood.size)
    number('uTint', tint)
    number('uLevel', level)
    number('uBass', bands.bass)
    number('uMid', bands.mid)
    number('uTreble', bands.treble)
    number('uRipple', mood.ripple)
    number('uThought', Math.min(1, mood.signals / 16))
    number('uSweep', mood.sweep)
    gl.uniform3f(accentPlace, accent[0] / 255, accent[1] / 255, accent[2] / 255)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  const follow = (seconds: number) => {
    const { level: target, phase, ui } = useStore.getState()
    const wanted = MOODS[phase]
    mood = easeMood(mood, wanted, seconds)
    turn += seconds * mood.spin * 1.6
    const hearing = phase === 'listening' || phase === 'speaking'
    level += ((hearing ? target : 0) - level) * (1 - Math.exp(-seconds * 12))
    bands = easeBands(bands, phase === 'speaking' ? outputBands() : phase === 'listening' ? micBands() : SILENT, seconds)
    // Asked for a colour, the whole disc takes it, thought included.
    const chosen = parseColour(ui.reactor.color ?? ui.accent)
    if (ACCENT[phase]) tinted = ACCENT[phase]
    accent = mix(accent, chosen ?? ACCENT[phase] ?? tinted, .1)
    tint += ((chosen ? 1 : mood.tint) - tint) * (1 - Math.exp(-seconds * 5))
    scale += (ui.reactor.scale - scale) * (1 - Math.exp(-seconds * 5))
  }
  const measure = (frameMs: number) => {
    sample.push(frameMs)
    if (sample.length < SAMPLE_FRAMES) return
    const next = nextQuality(quality, sample)
    sample = []
    if (next === quality) return
    quality = next
    resize()
    console.info(`[jarvis] holograma: nitidez em ${Math.round(DETAIL_LEVELS[quality] * 100)}%`)
  }
  const paint = (now: number) => {
    raf = requestAnimationFrame(paint)
    const gap = previous ? now - previous : RESTING_FRAME_MS
    const phase = useStore.getState().phase
    const resting = phase === 'offline' || phase === 'dormant'
    if (resting && gap < RESTING_FRAME_MS - 2) return
    previous = now
    const seconds = Math.min(gap / 1000, .1)
    elapsed += seconds
    follow(seconds)
    draw()
    // Only a frame that was asked for at full speed says anything about the GPU.
    if (!resting && !document.hidden) measure(gap)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    raf = 0
    previous = 0
    sample = []
    if (active && !document.hidden && !reducedMotion) raf = requestAnimationFrame(paint)
    else { follow(1); draw() }
  }
  const observer = new ResizeObserver(() => { resize(); if (!raf) draw() })
  observer.observe(canvas)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const motionChanged = () => { reducedMotion = motion.matches; run() }
  motion.addEventListener('change', motionChanged)
  document.addEventListener('visibilitychange', run)
  // Standing still, the picture only changes when the phase does.
  const phaseChanged = useStore.subscribe((state, before) => { if (!raf && state.phase !== before.phase) { follow(1); draw() } })

  resize()
  run()
  return () => {
    cancelAnimationFrame(raf)
    observer.disconnect()
    motion.removeEventListener('change', motionChanged)
    document.removeEventListener('visibilitychange', run)
    phaseChanged()
  }
}

/** The whole window, behind everything. A failure hands back to the simple sphere. */
export function HoloCore({ active, onFailure }: { active: boolean; onFailure: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const lost = (event: Event) => { event.preventDefault(); onFailure() }
    element.addEventListener('webglcontextlost', lost)
    let stop = () => {}
    try { stop = start(element, active) } catch (error) {
      console.warn('[jarvis] holograma indisponível:', error)
      onFailure()
    }
    return () => { stop(); element.removeEventListener('webglcontextlost', lost) }
  }, [active, onFailure])

  return <canvas ref={canvas} className="holo-core-canvas" aria-hidden="true" />
}
