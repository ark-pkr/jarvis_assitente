import { useEffect, useRef, useState } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { MissionControl } from './ui/MissionControl'
import { WorkspacePanel } from './ui/WorkspacePanel'
import { useWorkspace, flushWorkspace } from './workspace'
import { Boot } from './ui/Boot'
import { Ignition } from './ui/Ignition'
import { Diagnostics } from './ui/Diagnostics'
import { BOOT_MS, useStore } from './store'
import { startVoice, type Voice, type VoiceMode } from './lib/voice'
import { createSpeaker, cycleVoice, currentVoiceName } from './lib/tts'
import * as sfx from './lib/sfx'
import * as music from './lib/music'
import * as hands from './lib/hands'
import { listenForClap } from './lib/clap'
import * as camera from './lib/camera'
import { forTool, attention } from './lib/fillers'
import { chooseResponsePace, isArticleRequest } from './lib/responsePace'
import { mergeClarification, splitUnclearTranscript } from './lib/clarification'
import {
  ask,
  warm,
  interrupt,
  watchServers,
  watchPanels,
  watchBlades,
  watchCapture,
  watchUi,
  watchConnection,
  connectedLabels,
  usingBridge,
  type Msg,
} from './lib/brain'
import { startAnalyser, stopMicrophone, micLevel } from './lib/audio'
import { probeCapabilities } from './lib/capabilities'
import { BRIDGE_HTTP_URL, env } from './config'

/**
 * The conversation.
 *
 * This used to be a sequential loop — greet, await a capture, await an answer,
 * repeat — with the microphone opened and closed around each step. That shape
 * cannot be interrupted: while it is awaiting the answer, nothing is listening,
 * so there is no way for the user to get a word in.
 *
 * It is an event machine now. The voice loop runs continuously and pushes
 * events at us; every one of them is legal in every phase. Saying anything at
 * all stops him talking, and whatever you say next becomes the new turn.
 */

/** Zero keeps voice input active until the user explicitly pauses it. */
const AWAIT_SPEECH_MS = 0

/** Continue listening after every answer without an inactivity timeout. */
const FOLLOW_UP_MS = 0

/** crypto.randomUUID needs a secure context, which a LAN address over plain
 *  http is not. Not worth failing a whole turn over an id. */
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/** The same mishearings voice.ts accepts for the wake word — otherwise a turn
 *  that woke him as "travis" gets that word sent on to the model as a question. */
const NAME = '(?:jarvis|jarvys|jervis|jarviss|jarv|járvis|jarves)'
/** A bare vocative — "Jarvis", "hey jarvis" — with nothing asked. */
const BARE_NAME = new RegExp(`^(?:oi|olá|ola|ei)?\\s*${NAME}[\\s,.!?]*$`, 'i')
/** A leading vocative on a real command: "Jarvis, what's the weather". */
const LEADING_NAME = new RegExp(`^(?:oi|olá|ola|ei)?\\s*${NAME}\\b[\\s,.:!?-]*`, 'i')

export default function App() {
  const store = useStore
  const phase = useStore((s) => s.phase)
  const privacyMode = useWorkspace((s) => s.settings.privacyMode)
  const history = useRef<Msg[]>([])
  const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null)
  const voice = useRef<Voice | null>(null)
  const privacyActions = useRef<{
    goDormant: () => void
    startVoiceLoop: () => Promise<void>
    onVoiceError: (message: string) => void
  }>({ goDormant: () => {}, startVoiceLoop: async () => {}, onVoiceError: () => {} })

  /**
   * Monotonic turn counter. Every await in a turn checks it on the way out:
   * if it has moved, that turn was superseded by a barge-in and must not touch
   * the phase, the speaker, or the busy state on its way to the floor.
   */
  const turn = useRef(0)
  const booting = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingClarification = useRef<{ before: string; after: string } | null>(null)
  const clarificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clapToStart, setClapToStart] = useState(false)

  useEffect(() => {
    const restore = () => {
      const workspace = useWorkspace.getState()
      store.setState({ turns: workspace.sessions.find((s) => s.id === workspace.active)?.turns ?? [], panels: [], blades: [] })
    }
    restore()
    const save = store.subscribe((state, previous) => {
      if (state.turns !== previous.turns && !useWorkspace.getState().settings.privacyMode) {
        useWorkspace.getState().saveTurns(state.turns)
      }
    })
    const switched = useWorkspace.subscribe((state, previous) => {
      if (state.active !== previous.active) restore()
    })
    return () => { save(); switched(); flushWorkspace() }
  }, [store])

  // -- helpers --------------------------------------------------------------

  const clearIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = null
  }

  const clearClarification = () => {
    if (clarificationTimer.current) clearTimeout(clarificationTimer.current)
    clarificationTimer.current = null
    pendingClarification.current = null
  }

  const silence = () => {
    speaker.current?.cancel()
    speaker.current = null
  }

  const goDormant = () => {
    if (['thinking', 'tooling', 'speaking'].includes(store.getState().phase)) interrupt()
    clearIdle()
    clearClarification()
    silence()
    turn.current++
    const s = store.getState()
    s.setCaption('')
    s.setActiveTool(null)
    music.working(false)
    music.duck(false)
    sfx.duck(false)
    s.setPhase('dormant')
  }

  /** Open the mic and wait. `window` is how long before he gives up. */
  const listen = (window: number) => {
    clearIdle()
    const s = store.getState()
    s.setCaption('')
    s.setPhase('listening')
    sfx.play('listen')
    if (window > 0) idleTimer.current = setTimeout(goDormant, window)
  }

  /**
   * He says hello. The saved records are read here, on this machine, so this
   * costs no model call and cannot invent anything; once a day it is the whole
   * briefing, and after that a greeting is enough.
   */
  const greet = async () => {
    const workspace = useWorkspace.getState()
    if (!workspace.settings.greeting || workspace.settings.privacyMode) return
    const mine = ++turn.current
    let line = ''
    try {
      const today = new Date().toLocaleDateString('en-CA')
      const first = workspace.settings.briefingDay !== today
      const city = first ? workspace.settings.city.trim() : ''
      const response = await fetch(`${BRIDGE_HTTP_URL}/assistant/briefing?city=${encodeURIComponent(city)}`, { signal: AbortSignal.timeout(3000) })
      const briefing = await response.json() as { greeting: string; line: string }
      line = first ? briefing.line : `${briefing.greeting}.`
      useWorkspace.getState().setSettings({ briefingDay: today })
    } catch { return /* Silence is a fine way to start. */ }
    if (mine !== turn.current || !line) return
    const spk = createSpeaker()
    speaker.current = spk
    const s = store.getState()
    s.setPhase('speaking')
    s.setCaption(line)
    music.duck(true)
    spk.say(line)
    await spk.end()
    if (mine !== turn.current) return
    speaker.current = null
    music.duck(false)
    listen(AWAIT_SPEECH_MS)
    voice.current?.arm?.(15000)
  }

  // -- one turn -------------------------------------------------------------

  const respond = async (said: string, voiceInput = false): Promise<void> => {
    clearClarification()
    const mine = ++turn.current
    const stale = () => mine !== turn.current

    clearIdle()
    const s = store.getState()
    // Last turn's panels and blades go now, before the new answer starts
    // putting its own up. Anything the model marked sticky survives.
    s.clearPanels()
    s.clearBlades()
    s.setCaption('')
    s.pushTurn({ id: newId(), role: 'user', text: said })
    s.setPhase('thinking')

    const spk = createSpeaker()
    speaker.current = spk
    sfx.duck(true)
    music.duck(true)

    const turnId = newId()
    let started = false
    let filled = false
    const pace = chooseResponsePace(said, useWorkspace.getState().settings.fast)
    let acknowledgement: ReturnType<typeof setTimeout> | null = null

    try {
      if (voiceInput) acknowledgement = setTimeout(() => {
        if (stale() || started || filled) return
        filled = true
        store.getState().setCaption('Entendi, vou verificar.')
        spk.sayFast('Entendi, vou verificar.')
      }, 1800)
      const { text } = await ask(said, history.current, {
        onText: (delta) => {
          if (stale()) return
          if (!started) {
            if (acknowledgement) clearTimeout(acknowledgement)
            acknowledgement = null
            started = true
            store.getState().setPhase('speaking')
            store.getState().setCaption('')
            // The answer arriving is what ends the tool phase — a timer would
            // clear the readout while a slow tool was still running.
            store.getState().setActiveTool(null)
            music.working(false)
            store.getState().pushTurn({ id: turnId, role: 'jarvis', text: '' })
          }
          store.getState().appendToLastTurn(delta)
          spk.push(delta)
        },
        onTool: (name) => {
          if (stale()) return
          // Only claim the tooling phase while he has nothing to say yet.
          // Setting it unconditionally pinned the machine in 'tooling' for the
          // rest of any answer that called a tool after it started talking,
          // which also broke the reactor's lip-sync for the remainder.
          if (!started) store.getState().setPhase('tooling')
          store.getState().setActiveTool(name)
          sfx.play('tool')
          music.working(true)
          // Say something the moment work starts — a tool can take ten seconds
          // and silence that long reads as a crash. Once per turn only; a
          // chain of five tools shouldn't produce five apologies.
          if (!filled && !started) {
            filled = true
            if (acknowledgement) clearTimeout(acknowledgement)
            acknowledgement = null
            spk.sayFast(forTool(name))
          }
        },
      }, { fast: pace.fast, article: isArticleRequest(said) })

      if (stale()) return

      // The bridge keeps conversation state in its own session, so history is
      // only threaded through on the direct path.
      if (!usingBridge && !useWorkspace.getState().settings.privacyMode) {
        history.current.push({ role: 'user', content: said })
        history.current.push({ role: 'assistant', content: text || '…' })
        if (history.current.length > 16) {
          history.current = history.current.slice(-16)
        }
      }

      await spk.end()
      if (stale()) return
      sfx.play('done')
    } catch (err) {
      if (stale()) return
      console.error(err)
      sfx.play('error')
      store
        .getState()
        .setError(err instanceof Error ? err.message : 'Não foi possível concluir o pedido.')
    } finally {
      if (acknowledgement) clearTimeout(acknowledgement)
      if (!stale()) {
        speaker.current = null
        sfx.duck(false)
        music.duck(false)
        store.getState().setActiveTool(null)
        music.working(false)
        // Stay open. Having to say his name again to add one more sentence is
        // the difference between a conversation and a vending machine.
        listen(FOLLOW_UP_MS)
        voice.current?.arm?.(15000)
      }
    }
  }

  // -- voice events ---------------------------------------------------------

  /** What the voice loop should do with what it hears, derived from phase. */
  const mode = (): VoiceMode => {
    switch (store.getState().phase) {
      case 'offline':
      case 'boot':
        return 'deaf'
      case 'dormant':
        return 'wake'
      case 'waking':
      case 'listening':
        return 'command'
      default:
        return 'guard' // thinking, tooling, speaking
    }
  }

  const acceptVoice = (text: string) => {
    const pending = pendingClarification.current
    if (pending) {
      clearClarification()
      text = mergeClarification(pending, text)
    }
    void respond(text, true)
  }
  const onWake = (trailing: string) => {
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot') return

    store.getState().setError(null)
    sfx.play('wake')

    // "Jarvis, what's happening in AI this week" in one breath. Waiting for a
    // greeting he didn't need is the most common way an assistant wastes time.
    if (trailing) {
      acceptVoice(trailing)
      return
    }

    if (window.jarvisDesktop) { listen(AWAIT_SPEECH_MS); return }
    store.getState().setPhase('waking')

    // Answer to his name. Deliberately NOT awaited any more: the microphone is
    // already open and the echo filter knows his voice, so the user can talk
    // straight over the greeting instead of waiting it out.
    const greeting = createSpeaker()
    speaker.current = greeting
    greeting.say(attention())
    void greeting.end()

    listen(AWAIT_SPEECH_MS)
  }

  /**
   * Someone started talking. This is the whole point of the rewrite: he stops,
   * immediately, whatever he was doing.
   */
  const onSpeechStart = () => {
    clearIdle()
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot' || phase === 'dormant') return

    const wasBusy =
      phase === 'thinking' || phase === 'tooling' || phase === 'speaking'

    silence()
    if (wasBusy) {
      // Abandon the answer in flight. The turn counter moves in respond()'s
      // replacement; bumping it here covers the case where nothing replaces it.
      turn.current++
      interrupt()
      store.getState().setActiveTool(null)
      music.working(false)
      sfx.duck(false)
      music.duck(false)
    }
    store.getState().setPhase('listening')
  }

  const onUtterance = (text: string) => {
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot' || phase === 'dormant') return

    // People keep using his name as a vocative once they're already talking to
    // him. Strip it rather than sending "jarvis" to the model as a question.
    if (BARE_NAME.test(text)) {
      listen(AWAIT_SPEECH_MS)
      return
    }
    const said = text.replace(LEADING_NAME, '').trim()
    if (!said) {
      listen(AWAIT_SPEECH_MS)
      return
    }

    acceptVoice(said)
  }

  const onClarification = (text: string) => {
    const parts = splitUnclearTranscript(text.replace(LEADING_NAME, '').trim())
    if (!parts) {
      store.getState().setCaption('Não entendi com clareza. Diga “Jarvis” e repita o pedido completo.')
      return
    }
    clearClarification()
    pendingClarification.current = parts
    listen(AWAIT_SPEECH_MS)
    store.getState().setCaption(`${text} — repita somente o trecho marcado.`)
    const prompt = createSpeaker()
    speaker.current = prompt
    prompt.sayFast('Não entendi uma parte do seu pedido. Repita só esse trecho, por favor.')
    void prompt.end()
    voice.current?.arm?.(25000)
    clarificationTimer.current = setTimeout(() => {
      clearClarification()
      store.getState().setCaption('')
    }, 25000)
  }

  const onPartial = (text: string) => {
    store.getState().setCaption(text)
  }

  const onVoiceError = (message: string) => {
    store.getState().setError(message)
  }

  const startVoiceLoop = async () => {
    if (useWorkspace.getState().settings.privacyMode) return
    if (voice.current?.live()) return
    await probeCapabilities()
    voice.current = await startVoice({ mode, onWake, onSpeechStart, onPartial, onUtterance, onClarification, onError: onVoiceError })
    listen(AWAIT_SPEECH_MS)
  }

  privacyActions.current = { goDormant, startVoiceLoop, onVoiceError }
  useEffect(() => {
    const actions = privacyActions.current
    if (privacyMode) {
      if (!['offline', 'boot'].includes(useStore.getState().phase)) actions.goDormant()
      voice.current?.stop()
      voice.current = null
      void stopMicrophone().catch((error: Error) => actions.onVoiceError(`Não foi possível desligar o microfone: ${error.message}`))
      return
    }
    if (!['offline', 'boot'].includes(useStore.getState().phase) && !voice.current?.live()) {
      void actions.startVoiceLoop().catch((error: Error) => actions.onVoiceError(error.message))
    }
  }, [privacyMode])

  const pauseVoiceForEnrollment = () => {
    goDormant()
    voice.current?.stop()
    voice.current = null
  }

  const resumeVoiceAfterEnrollment = () => {
    if (store.getState().phase === 'offline' || store.getState().phase === 'boot') return
    void startVoiceLoop().catch((error) => onVoiceError(error instanceof Error ? error.message : 'Não foi possível reativar a escuta.'))
  }

  // -- power on -------------------------------------------------------------

  const powerOn = async () => {
    // The ignition button and the space bar can both land here, and the phase
    // only moves after the first await — so without this a double press boots
    // twice, arming two voice loops and two download polls.
    if (booting.current) return
    booting.current = true

    try {
      await ignite()
    } catch (err) {
      // The guard must not outlive a failed boot. Audio unlock can be refused,
      // the microphone prompt dismissed, the bridge unreachable at the wrong
      // moment — and with the flag still latched the ignition button was dead
      // for the rest of the page, recoverable only by reloading. Reset it and
      // put the button back so the user can simply press it again.
      booting.current = false
      console.error('[jarvis] power-up failed:', err)
      store.getState().setPhase('offline')
      store
        .getState()
        .setError(
          err instanceof Error
            ? `Falha ao iniciar: ${err.message}`
            : 'Não foi possível iniciar. Clique para tentar novamente.',
        )
    }
  }

  const ignite = async () => {
    const s = store.getState()
    const { bootSeen, fullBoot } = useWorkspace.getState().settings
    const short = window.matchMedia('(prefers-reduced-motion: reduce)').matches || (bootSeen && !fullBoot)
    s.setBootShort(short)

    // Must happen inside the click handler — browsers won't start an
    // AudioContext or speech synthesis without a user gesture.
    await sfx.unlockAudio()
    sfx.play('boot')
    // The score. Must be started from inside this click handler for the same
    // reason as the rest of the audio.
    music.enable()
    if (!short) music.playBoot()
    music.startAmbient()

    s.setPhase('boot')

    watchServers((servers) => store.getState().setConnected(servers))
    watchPanels((panel) => store.getState().pushPanel(panel))
    watchBlades((blade) => store.getState().pushBlade(blade))

    /**
     * JARVIS asking to see something.
     *
     * Announced on screen for as long as it takes, with whatever he said he was
     * looking for. The camera's own light is on too, but a hardware light that
     * appears with no explanation is exactly the thing that makes people
     * distrust an assistant — so the interface says it before they have to ask.
     */
    watchCapture(async (req) => {
      if (req.mode === 'screen') {
        store.getState().setLooking(req.reason ? `sua tela · ${req.reason}` : 'sua tela')
        try {
          if (!window.jarvisDesktop) return { error: 'Olhar a tela só funciona no aplicativo do Windows.' }
          return await window.jarvisDesktop.captureScreen()
        } catch (err) {
          return { error: `Não foi possível capturar a tela: ${(err as Error)?.message ?? err}` }
        } finally {
          store.getState().setLooking(null)
        }
      }
      const note =
        req.mode === 'watch'
          ? req.when === 'past'
            ? req.reason || 'revendo os últimos segundos'
            : `${req.reason || 'observando'} · ${req.seconds}s`
          : req.reason || 'dando uma olhada'
      store.getState().setLooking(note)

      // The past is only available if something has been remembering it, and
      // that only happens while the camera is on screen. Answering plainly
      // beats opening the camera and recording the next few seconds instead,
      // which is a different question from the one that was asked.
      if (req.mode === 'watch' && req.when === 'past' && camera.bufferedSeconds() < 1) {
        store.getState().setLooking(null)
        return {
          error:
            'Não há imagens recentes: a câmera precisa estar aberta na tela para ' +
            'eu lembrar do que acabou de acontecer. Peça para abrir a câmera e ' +
            'eu posso observar a partir daí.',
        }
      }

      // Held for the whole capture. Without this the stream can be torn down by
      // whoever else was using it half way through a six-second watch.
      let held = false
      try {
        await camera.holdCamera()
        held = true
        if (req.mode === 'look') return camera.grabFrame()
        if (req.when === 'past') {
          const grid = camera.recentGrid(req.seconds, 9)
          return grid ?? { error: 'Não há imagens recentes suficientes para rever.' }
        }
        return await camera.watchAhead(req.seconds, 9)
      } catch (err) {
        return {
          error:
            (err as DOMException)?.name === 'NotAllowedError'
              ? 'A câmera não foi permitida, então não consigo ver nada.'
              : `Não foi possível ler a câmera: ${(err as Error)?.message ?? err}`,
        }
      } finally {
        if (held) camera.releaseCamera()
        store.getState().setLooking(null)
      }
    })

    // The interface is JARVIS's to drive. These arrive out of band, pushed
    // mid-turn the way panels are, so a command can retint the reactor or put
    // something into orbit while he is still speaking the sentence about it.
    watchUi((op, args) => {
      const s = store.getState()
      const a = (args ?? {}) as Record<string, any>
      switch (op) {
        case 'patch':
          s.applyUi(args)
          break
        case 'orbit':
          if (a.action === 'add') s.addOrbit(args)
          else if (a.action === 'remove') s.removeOrbit(String(a.id))
          else s.clearOrbits()
          break
        case 'effect':
          s.fireEffect(a.kind)
          break
        case 'helios': {
          const current = useWorkspace.getState().settings.helios
          const patch: Partial<typeof current> = {}
          const action = a.action
          if (action === 'pause' && (typeof a.value === 'boolean' || a.value === undefined)) patch.paused = a.value !== false
          else if (action === 'color' && typeof a.value === 'string') {
            const colors = { gold: 'gold', amber: 'gold', cyan: 'cyan', blue: 'cyan', violet: 'violet', purple: 'violet', emerald: 'emerald', green: 'emerald', rose: 'rose', pink: 'rose' } as const
            const color = colors[a.value.toLowerCase() as keyof typeof colors]
            if (color) patch.color = color
          } else if (action === 'cinema' && (typeof a.value === 'boolean' || a.value === undefined)) patch.cinema = a.value !== false
          else if (action === 'quality' && ['auto', 'eco', 'balanced', 'ultra'].includes(String(a.value))) patch.quality = a.value as typeof current.quality
          else if (action === 'intro') { patch.introSequence = current.introSequence + 1; patch.paused = false }
          else if (action === 'reset') Object.assign(patch, { paused: false, speed: 1, glow: 1, separation: 0, color: 'gold', quality: 'auto', bloom: true, autoRotate: true, cinema: false })
          if (Object.keys(patch).length) useWorkspace.getState().setSettings({ visualTheme: 'helios', helios: patch })
          break
        }
        case 'reset':
          s.resetUi()
          break
        case 'screen':
          s.clearScreen(a.what ?? 'all')
          break
        default:
          console.warn('[jarvis] unknown ui op:', op, args)
      }
    })
    // In bridge mode the conversation lives in the agent session, which is tied
    // to the socket — so a drop silently wipes his memory while the transcript
    // on screen still shows it. Better to say so than to let him quietly forget.
    watchConnection((state) => {
      if (state === 'lost') {
        store.getState().setError('Conexão com o servidor perdida. Reconectando…')
      } else if (state === 'reconnected') {
        store
          .getState()
          .setError('Servidor reconectado. A conversa selecionada será retomada no próximo pedido.')
      }
    })
    const warming = warm().catch((err: Error) => s.setError(err.message))

    if (!usingBridge && !env.anthropicKey) {
      s.setError(
        'Sem chave da API: copie .env.example para .env.local e preencha VITE_ANTHROPIC_API_KEY.',
      )
    }

    // Long enough for the four-beat start-up sequence in Boot.tsx to play —
    // status bar, rings, suit schematic, reactor power-up — before the live
    // interface takes over. Kept a touch under the boot cue so the music is
    // still rising as the reactor lands.
    await new Promise((r) => setTimeout(r, short ? BOOT_MS.short : BOOT_MS.full)) // boot sequence
    await warming
    useWorkspace.getState().setSettings({ bootSeen: true })
    store.getState().setConnected(connectedLabels())
    store.getState().setVoice(currentVoiceName())

    // The analyser is what makes the reactor pulse with your voice. It needs a
    // getUserMedia stream; speech recognition does not, and gets its own. So a
    // failure here costs the animation and nothing else — saying "voice input
    // is unavailable" was both alarming and untrue.
    if (!useWorkspace.getState().settings.privacyMode) {
      try {
        await startAnalyser()
      } catch {
        console.warn(
          '[jarvis] no microphone stream — the reactor will not pulse with your ' +
            'voice. Speech recognition is unaffected.',
        )
      }
    }

    if (useWorkspace.getState().settings.privacyMode) store.getState().setPhase('dormant')
    else {
      await startVoiceLoop()
      void greet()
    }
  }

  // -- starting without a click ---------------------------------------------

  // Both opt-in, because both mean the microphone opens with nobody at the app.
  useEffect(() => {
    void window.jarvisDesktop?.settings().then((settings) => {
      setClapToStart(settings.clapToStart)
      if (settings.autoActivate && store.getState().phase === 'offline') void powerOn()
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- clap to start --------------------------------------------------------

  /**
   * A clap brings him up, as an alternative to the button.
   *
   * Only while the ignition screen is showing, and torn down the moment he
   * boots — the microphone is about to belong to the voice loop, and two
   * analysers arguing over the same stream is how you get an assistant that
   * hears half of what you say.
   *
   * Deliberately silent about failure. If the microphone is refused, or has not
   * been granted yet, the button is still right there; announcing an error
   * about a feature nobody asked for would be worse than quietly doing without.
   */
  useEffect(() => {
    if (phase !== 'offline' || (window.jarvisDesktop && !clapToStart)) return
    let live: { stop: () => void } | null = null
    let gone = false
    void listenForClap(() => {
      if (!gone) void powerOn()
    }).then((l) => {
      if (gone) l.stop()
      else live = l
    })
    return () => {
      gone = true
      live?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clapToStart])

  // -- level pump + keys ----------------------------------------------------

  /** Space and the global shortcut are one gesture: "I'm talking to you". */
  const activate = () => {
    voice.current?.arm?.(30000, true)
    const phase = store.getState().phase
    if (phase === 'offline') {
      void powerOn()
    } else if (phase === 'boot') {
      /* ignore — the boot sequence owns the phase until it finishes */
    } else if (
      phase === 'thinking' ||
      phase === 'tooling' ||
      phase === 'speaking'
    ) {
      onSpeechStart()
      listen(AWAIT_SPEECH_MS)
    } else {
      onWake('')
    }
  }

  useEffect(() => {
    // A timer rather than requestAnimationFrame, which stops with the window,
    // and the floating orb has to keep moving exactly when the window is gone.
    const pump = () => {
      if (document.hidden && !window.jarvisDesktop) return
      const st = store.getState()
      // While speaking, follow JARVIS's own output rather than the mic, so the
      // orb lip-syncs instead of reacting to room noise.
      const lvl =
        st.phase === 'speaking' && speaker.current
          ? speaker.current.level()
          : micLevel()
      if (Math.abs(lvl - st.level) >= .015 || (lvl === 0 && st.level !== 0)) st.setLevel(lvl)
      window.jarvisDesktop?.publishState({ phase: st.phase, level: lvl, caption: st.caption === '…' ? '' : st.caption, looking: st.looking ?? '' })
    }
    const meter = setInterval(pump, 66)
    const hotkey = window.jarvisDesktop?.onHotkey(activate)

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return

      // V auditions the next British voice installed on this machine. Which
      // ones exist varies per Mac, so hearing them beats trusting a ranking.
      // Bare V only — ⌘V and ⌃V are paste, and swallowing those was rude.
      if (
        e.key === 'v' &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault()
        const name = cycleVoice()
        store.getState().setVoice(name)
        silence()
        const demo = createSpeaker()
        speaker.current = demo
        demo.say('Voz em português selecionada. À sua disposição, senhor.')
        void demo.end()
        return
      }

      // G puts the camera on and starts tracking hands. Off by default and
      // never implicit: a webcam that turns itself on because an interface
      // thought it might be useful is not a trade anyone agreed to.
      if (e.key === 'g' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const on = store.getState().gestures
        if (on) {
          hands.disableHands()
          store.getState().setGestures(false)
        } else {
          store.getState().setError(null)
          void hands
            .enableHands()
            .then(() => store.getState().setGestures(true))
            .catch((err: Error) => {
              store.getState().setGestures(false)
              store
                .getState()
                .setError(
                  err?.name === 'NotAllowedError'
                    ? 'Acesso à câmera negado: o controle por gestos não está disponível.'
                    : `Não foi possível iniciar o controle por gestos: ${err?.message ?? err}`,
                )
            })
        }
        return
      }

      // T speaks a fixed line, bypassing the wake word, the recogniser and the
      // model entirely. When "I can't hear him" is the report, this is the one
      // keypress that separates a broken voice engine from a broken voice loop
      // — and it prints the verdict rather than making you infer it.
      if (e.key === 't' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        silence()
        const t = createSpeaker()
        speaker.current = t
        t.say('Teste de áudio. Se consegue me ouvir, a voz está funcionando, senhor.')
        void t.end().then(() => {
          const d = (window as unknown as Record<string, Record<string, unknown>>).__tts
          console.info('[jarvis] audio test →', d)
          if (d && d.started === 0 && d.rescued === 0) {
            store.getState().setError(
              `Nenhum som foi produzido. Motor: ${d.engine}, voz: ${d.voice}, erro: ${d.lastError || 'nenhum'}.`,
            )
          }
        })
        return
      }

      // Escape stands the whole thing down — the one thing the old build had
      // no key for at all.
      if (e.key === 'Escape') {
        e.preventDefault()
        if (store.getState().phase !== 'offline') goDormant()
        return
      }

      // Space starts a turn without the wake word. Worth using while filming so
      // a missed wake word doesn't cost a take.
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      activate()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      clearInterval(meter)
      hotkey?.()
      window.removeEventListener('keydown', onKey)
      clearIdle()
      clearClarification()
      voice.current?.stop()
      speaker.current?.cancel()
      // The camera must not outlive the page that turned it on.
      hands.disableHands()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Scene />
      <WorkspacePanel onStop={goDormant} onPauseVoice={pauseVoiceForEnrollment} onResumeVoice={resumeVoiceAfterEnrollment} onRepeat={(text) => { goDormant(); void respond(text) }} onTestVoice={() => {
        goDormant()
        const mine = turn.current
        const test = createSpeaker()
        speaker.current = test
        test.say('Teste de voz em português. Minha fala está no volume definido no aplicativo. Ajuste também o volume do Chrome no Windows, se necessário.')
        void test.end().then(() => { if (mine === turn.current) { speaker.current = null; listen(0) } })
      }} />
      <Hud />
      <MissionControl send={(text) => { goDormant(); void respond(text) }} />
      <Boot />
      <Diagnostics />
      <Ignition onStart={() => void powerOn()} />
    </>
  )
}
