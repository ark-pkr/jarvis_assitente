import { useEffect, useRef } from 'react'
import { micBands } from '../lib/audio'
import { easeBands, outputBands, SILENT, type Bands } from '../lib/voiceBands'
import { feelingNow, useStore } from '../store'
import { useWorkspace } from '../workspace'
import { BLACK_HOLE, VERTEX } from './holoShaders'
import { DETAIL_LEVELS, nextQuality, pictureSize, SAMPLE_FRAMES } from './holoQuality'
import { PLANETS, planetsAt } from './planets'
import { daylight, dayShade } from './dayCycle'
import { askedShower, INTRO_DONE, INTRO_SECONDS, introAt, MERGER_SECONDS, mergerAt, meteorShower, NO_MERGER, nextMergerIn, takeSpectacles } from './cosmicEvents'
import { ACCENT, easeMood, feelingColour, MOODS, mix, moodFor, parseColour, type Rgb } from './sphereMood'

/** Doing nothing does not need sixty frames, and the fan will thank it. */
const RESTING_FRAME_MS = 33
const NEUTRAL: Rgb = [255, 171, 78]
/** How far the mouse swings the camera: wide around, barely up and down, where the disc changes shape. */
const LOOK_AROUND = .14
const LOOK_UP = .05
/** The small window has to fit the whole disc across its width. */
const MIRROR_ZOOM = .9
/** The deep model reports itself as this tool while it thinks; the jets show for as long. */
const DEEP_THOUGHT = /pensar melhor/
/** The usual camera distance; the opening flight starts several times further out. */
const CAMERA_DISTANCE = 24
/** The opening plays once per run of the app, not each time the canvas is rebuilt. */
let introPlayed = false
/** A merger on its own waits for a quiet moment: nothing being said or worked on. */
const QUIET_PHASES = ['offline', 'dormant', 'listening']

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

function start(canvas: HTMLCanvasElement, active: boolean, mirror: boolean) {
  const gl = canvas.getContext('webgl2', { alpha: mirror, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'high-performance' })
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

  const names = ['uTime', 'uTurn', 'uGlow', 'uZoom', 'uTint', 'uLevel', 'uBass', 'uMid', 'uTreble', 'uRipple', 'uThought', 'uSweep', 'uPush', 'uBare', 'uJet', 'uDay', 'uDistance', 'uLight', 'uWarp', 'uAurora', 'uMeteor', 'uFlash', 'uWaveTime', 'uWave']
  const places = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(made, name)]))
  const resolution = gl.getUniformLocation(made, 'uResolution')
  const accentPlace = gl.getUniformLocation(made, 'uAccent')
  const lookPlace = gl.getUniformLocation(made, 'uLook')
  const planetPlace = gl.getUniformLocation(made, 'uPlanets')
  const planetVoicePlace = gl.getUniformLocation(made, 'uPlanetVoice')
  const companionPlace = gl.getUniformLocation(made, 'uCompanion')
  gl.uniform3fv(gl.getUniformLocation(made, 'uPlanetDeep'), PLANETS.flatMap((world) => world.deep.map((part) => part / 255)))
  gl.uniform3fv(gl.getUniformLocation(made, 'uPlanetPale'), PLANETS.flatMap((world) => world.pale.map((part) => part / 255)))

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
  let aim = { x: 0, y: 0 }
  let look = { x: 0, y: 0 }
  let push = 0
  let gather = 0
  let presence = 0
  let jets = 0
  let day = 1
  let shade = dayShade(1)
  let clockReadAt = -Infinity
  // The shows, each timed in seconds of picture since it began; null when not running.
  const { holoIntro } = useWorkspace.getState().settings
  let introSince: number | null = !mirror && active && holoIntro && !introPlayed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : null
  if (introSince !== null) introPlayed = true
  let intro = introSince === null ? INTRO_DONE : introAt(0)
  let mergerSince: number | null = null
  let merger = NO_MERGER
  let mergerDueAt = Date.now() + nextMergerIn()
  let showerSince: number | null = null
  let meteor = 0
  let aurora = 0
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
    number('uGlow', (.5 + mood.glow * .55) * shade.glow)
    // Below 1 the mood leans in towards the speaker; the camera does the leaning.
    number('uZoom', scale / mood.size * (mirror ? MIRROR_ZOOM : 1))
    number('uTint', tint)
    number('uLevel', level)
    number('uBass', bands.bass)
    number('uMid', bands.mid)
    number('uTreble', bands.treble)
    number('uRipple', mood.ripple)
    number('uThought', Math.min(1, mood.signals / 16))
    number('uSweep', mood.sweep)
    number('uPush', push)
    number('uBare', mirror ? 1 : 0)
    number('uJet', jets)
    number('uDay', day)
    number('uDistance', CAMERA_DISTANCE * intro.distance)
    number('uLight', intro.light)
    number('uWarp', intro.warp)
    number('uAurora', aurora)
    number('uMeteor', meteor)
    number('uFlash', merger.flash)
    number('uWaveTime', merger.waveTime)
    number('uWave', merger.wave)
    gl.uniform4f(companionPlace, merger.x, merger.y, merger.z, merger.size)
    gl.uniform4fv(planetPlace, planetsAt(turn, gather, presence, bands))
    gl.uniform1fv(planetVoicePlace, PLANETS.map((world) => bands[world.voice]))
    gl.uniform2f(lookPlace, look.x * LOOK_AROUND, -look.y * LOOK_UP + intro.pitch)
    gl.uniform3f(accentPlace, accent[0] / 255, accent[1] / 255, accent[2] / 255)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  /** Starts and advances the opening, the merger and the meteors. */
  const shows = (seconds: number, phase: string, rare: boolean, birthday: string) => {
    for (const kind of takeSpectacles()) {
      if (kind === 'abertura') introSince = 0
      if (kind === 'fusao' && mergerSince === null) mergerSince = 0
      if (kind === 'meteoros') showerSince = 0
    }
    // A still frame (seconds of 1) is not time passing in a show.
    const step = seconds >= 1 ? 0 : seconds
    if (introSince !== null) {
      introSince += step
      intro = introAt(introSince)
      if (introSince >= INTRO_SECONDS) introSince = null
    }
    if (mergerSince === null && rare && Date.now() >= mergerDueAt && QUIET_PHASES.includes(phase) && !document.hidden) mergerSince = 0
    if (mergerSince !== null) {
      mergerSince += step
      merger = mergerAt(mergerSince)
      if (mergerSince >= MERGER_SECONDS) { mergerSince = null; merger = NO_MERGER; mergerDueAt = Date.now() + nextMergerIn() }
    }
    let asked = 0
    if (showerSince !== null) {
      showerSince += step
      asked = askedShower(showerSince)
      if (asked === 0 && showerSince > 1) showerSince = null
    }
    meteor = Math.max(asked, rare ? meteorShower(new Date(), birthday) : 0)
  }
  /** While a show runs, it gets every frame, and its cost says nothing about the GPU. */
  const showing = () => introSince !== null || mergerSince !== null || meteor > 0

  const follow = (seconds: number) => {
    const state = useStore.getState()
    const { level: target, phase, ui } = state
    const feeling = feelingNow(state)
    const wanted = moodFor(phase, feeling)
    mood = easeMood(mood, wanted, seconds)
    // The clock moves slowly; once a minute is plenty.
    const settings = useWorkspace.getState().settings
    if (elapsed - clockReadAt > 60 || seconds >= 1) {
      clockReadAt = elapsed
      day = settings.dayCycle ? daylight() : 1
    }
    // Brighter in the dark, the way the real one is.
    aurora += ((settings.aurora && !mirror ? .55 + .45 * (1 - day) : 0) - aurora) * (1 - Math.exp(-seconds * 1.5))
    if (!mirror) shows(seconds, phase, settings.cosmicEvents, settings.birthday)
    // At night everything is calmer, but a phase that is working keeps half of its light.
    const resting = phase === 'offline' || phase === 'dormant'
    const night = dayShade(day)
    shade = resting ? night : { glow: 1 - (1 - night.glow) / 2, spin: 1 - (1 - night.spin) / 2 }
    turn += seconds * mood.spin * 1.6 * shade.spin
    const deep = (phase === 'thinking' || phase === 'tooling') && DEEP_THOUGHT.test(state.activeTool ?? '')
    jets += ((deep && !mirror ? 1 : 0) - jets) * (1 - Math.exp(-seconds * (deep ? 3 : 1.5)))
    if (jets < .005) jets = 0
    const hearing = phase === 'listening' || phase === 'speaking'
    level += ((hearing ? target : 0) - level) * (1 - Math.exp(-seconds * 12))
    // The small window has neither the microphone nor the voice, only the level it is sent.
    const heard = mirror ? (hearing ? { bass: level * .7, mid: level * .5, treble: level * .4 } : SILENT) : phase === 'speaking' ? outputBands() : phase === 'listening' ? micBands() : SILENT
    bands = easeBands(bands, heard, seconds)
    const { liveCamera, reactiveStars, orbitingPlanets } = useWorkspace.getState().settings
    const toward = liveCamera && !mirror ? aim : { x: 0, y: 0 }
    const settling = 1 - Math.exp(-seconds * 2.5)
    look = { x: look.x + (toward.x - look.x) * settling, y: look.y + (toward.y - look.y) * settling }
    // Your voice pulls the stars in, and his pushes them out.
    const pull = phase === 'listening' ? level : phase === 'speaking' ? -level : 0
    const easing = 1 - Math.exp(-seconds * 6)
    push += ((reactiveStars && !mirror ? pull : 0) - push) * easing
    // The worlds answer the same way, and the small window has no room for them.
    gather += (pull - gather) * easing
    const showing = orbitingPlanets && !mirror ? 1 : 0
    presence += (showing - presence) * (1 - Math.exp(-seconds * 3))
    if (!showing && presence < .01) presence = 0
    // Asked for a colour, the whole disc takes it, thought included.
    const chosen = parseColour(ui.reactor.color ?? ui.accent) ?? feelingColour(phase, feeling)
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
    if ((resting && !showing() || mirror) && gap < RESTING_FRAME_MS - 2) return
    previous = now
    const seconds = Math.min(gap / 1000, .1)
    elapsed += seconds
    follow(seconds)
    draw()
    // Only a frame that was asked for at full speed says anything about the GPU.
    if (!resting && !mirror && !document.hidden && !showing()) measure(gap)
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
  const aimAt = (event: PointerEvent) => { aim = { x: event.clientX / innerWidth * 2 - 1, y: event.clientY / innerHeight * 2 - 1 } }
  const aimAhead = () => { aim = { x: 0, y: 0 } }
  window.addEventListener('pointermove', aimAt, { passive: true })
  document.documentElement.addEventListener('mouseleave', aimAhead)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const motionChanged = () => { reducedMotion = motion.matches; run() }
  motion.addEventListener('change', motionChanged)
  document.addEventListener('visibilitychange', run)
  // Standing still, the picture only changes when the phase does.
  const phaseChanged = useStore.subscribe((state, before) => { if (!raf && (state.phase !== before.phase || feelingNow(state) !== feelingNow(before))) { follow(1); draw() } })

  resize()
  run()
  return () => {
    cancelAnimationFrame(raf)
    observer.disconnect()
    window.removeEventListener('pointermove', aimAt)
    document.documentElement.removeEventListener('mouseleave', aimAhead)
    motion.removeEventListener('change', motionChanged)
    document.removeEventListener('visibilitychange', run)
    phaseChanged()
  }
}

/** The whole window, behind everything. A failure hands back to the simple sphere. */
export function HoloCore({ active, onFailure, mirror = false }: { active: boolean; onFailure: () => void; mirror?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const lost = (event: Event) => { event.preventDefault(); onFailure() }
    element.addEventListener('webglcontextlost', lost)
    let stop = () => {}
    try { stop = start(element, active, mirror) } catch (error) {
      console.warn('[jarvis] holograma indisponível:', error)
      onFailure()
    }
    return () => { stop(); element.removeEventListener('webglcontextlost', lost) }
  }, [active, onFailure, mirror])

  return <canvas ref={canvas} className="holo-core-canvas" aria-hidden="true" />
}
