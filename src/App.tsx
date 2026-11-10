import { useEffect, useRef, useState } from 'react'
import { Scene } from './scene/Scene'
import { requestSpectacle } from './scene/cosmicEvents'
import { Hud } from './ui/Hud'
import { MissionControl } from './ui/MissionControl'
import { WorkspacePanel } from './ui/WorkspacePanel'
import { setCinema } from './lib/cinema'
import { useWorkspace } from './workspace'
import { useSessionSync } from './app/useSessionSync'
import { createShortcutHandler } from './app/shortcuts'
import { BARE_NAME, LEADING_NAME } from './app/wakeName'
import { Boot } from './ui/Boot'
import { Ignition } from './ui/Ignition'
import { Diagnostics } from './ui/Diagnostics'
import { BOOT_MS, useStore, type Timer } from './store'
import { lastRoomSpeech, startVoice, type Voice, type VoiceMode } from './lib/voice'
import { createSpeaker, cycleVoice, currentVoiceName, speakingAloud } from './lib/tts'
import { watchApproval, type Approval } from './lib/bridge'
import { approvalQuestion, ASK_AGAIN, readAnswer } from './lib/approvalVoice'
import { finishLecture, recordLecture, type LectureRecording } from './lib/lectureRecorder'
import { endsLecture } from './lib/lectureWords'
import { alertLine, alertsToSpeak, loadSpoken, saveSpoken, type Alert } from './lib/spokenAlerts'
import * as sfx from './lib/sfx'
import * as music from './lib/music'
import { listenForClap } from './lib/clap'
import * as camera from './lib/camera'
import { forRequest, forTool, attention, speakFormally, working } from './lib/fillers'
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
} from './lib/brain'
import { startAnalyser, stopMicrophone, micLevel } from './lib/audio'
import { probeCapabilities } from './lib/capabilities'
import { BRIDGE_HTTP_URL } from './config'

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

/** Called during a class, he listens for this long and goes back to writing it down. */
const LECTURE_EAR_MS = 12000
const NUDGE_CHECK_MS = 5 * 60000
/** Someone talked this recently, so whatever he would bring up can wait. */
const ROOM_QUIET_MS = 3 * 60000

export default function App() {
  const store = useStore
  const phase = useStore((s) => s.phase)
  const privacyMode = useWorkspace((s) => s.settings.privacyMode)
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
  /** The confirmation waiting for an answer, and whether the microphone is open for it. */
  const approval = useRef<Approval | null>(null)
  const answering = useRef(false)
  const doubts = useRef(0)
  const asker = useRef<ReturnType<typeof createSpeaker> | null>(null)
  const keepListening = useRef<ReturnType<typeof setInterval> | null>(null)
  const booting = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingClarification = useRef<{ before: string; after: string } | null>(null)
  const clarificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clapToStart, setClapToStart] = useState(false)
  const recording = useRef<LectureRecording | null>(null)
  /** Until when he takes what he hears as meant for him during a class. */
  const lectureEar = useRef(0)

  useSessionSync()

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
    music.duck(Boolean(store.getState().lecture))
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
      const { personality, learn, remember } = workspace.settings
      const response = await fetch(`${BRIDGE_HTTP_URL}/assistant/briefing?city=${encodeURIComponent(city)}&first=${first ? 1 : 0}&learn=${learn && remember ? 1 : 0}&formal=${personality === 'formal' ? 1 : 0}`, { signal: AbortSignal.timeout(3000) })
      const briefing = await response.json() as { opening: string; line: string }
      line = first ? briefing.line : briefing.opening
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
    keepEar()
  }

  // -- one turn -------------------------------------------------------------

  const respond = async (said: string, voiceInput = false): Promise<void> => {
    if (store.getState().lecture && endsLecture(said)) {
      lectureEar.current = 0
      await endLecture()
      return
    }
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
    if (voiceInput) sfx.play('heard')
    sfx.duck(true)
    music.duck(true)

    const turnId = newId()
    speakFormally(useWorkspace.getState().settings.personality === 'formal')
    let started = false
    let filled = false
    const pace = chooseResponsePace(said, useWorkspace.getState().settings.fast)
    let acknowledgement: ReturnType<typeof setTimeout> | null = null

    try {
      const early = voiceInput && pace.fast ? forRequest(said) : null
      if (early) {
        filled = true
        store.getState().setCaption(early)
        spk.sayFast(early)
      }
      if (voiceInput) acknowledgement = setTimeout(() => {
        if (stale() || started || filled) return
        filled = true
        const line = working()
        store.getState().setCaption(line)
        spk.sayFast(line)
      }, 1800)
      await ask(said, {
        onTone: (tone) => { if (!stale()) spk.setTone(tone) },
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
        music.duck(Boolean(store.getState().lecture))
        store.getState().setActiveTool(null)
        music.working(false)
        // Stay open. Having to say his name again to add one more sentence is
        // the difference between a conversation and a vending machine.
        listen(FOLLOW_UP_MS)
        keepEar()
      }
    }
  }

  // -- a class --------------------------------------------------------------

  const beginLecture = async (lecture: { id: string; title: string; started: number }) => {
    if (recording.current) return
    recording.current = await recordLecture(lecture.id, (lost) => store.getState().setError(`Não consegui transcrever ${lost} minuto(s) da aula. Verifique a conexão.`))
    store.getState().setLecture(lecture)
    music.duck(true)
  }

  /** The notes open by themselves: the person asked for a class, not for a question. */
  const endLecture = async () => {
    const live = recording.current
    const lecture = store.getState().lecture
    if (!live || !lecture) return
    recording.current = null
    const mine = ++turn.current
    const s = store.getState()
    s.setLecture(null)
    s.setPhase('thinking')
    s.setCaption('Organizando as anotações da aula…')
    music.duck(false)
    let line = 'A aula terminou, mas não consegui organizar as anotações agora. O texto está salvo em Aprender.'
    try {
      await live.stop()
      const notes = await finishLecture(lecture.id)
      if (notes.notes) {
        line = notes.notes.spoken || notes.notes.summary || line
        store.getState().pushBlade({ id: `aula-${lecture.id}`, title: notes.title, kind: 'markup', html: notes.html, size: 'tall', hold: 'sticky' })
      } else line = 'Não ouvi nada que pudesse anotar nessa aula.'
    } catch (error) { console.error(error) }
    if (mine !== turn.current) return
    const after = store.getState()
    after.pushTurn({ id: newId(), role: 'jarvis', text: line })
    after.setCaption(line)
    after.setPhase('speaking')
    const spk = createSpeaker()
    speaker.current = spk
    spk.say(line)
    await spk.end()
    if (mine !== turn.current) return
    speaker.current = null
    listen(AWAIT_SPEECH_MS)
    keepEar()
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
        // The teacher is not talking to him. Everything else that is said goes to
        // the notes, and he stays out of the conversation.
        return store.getState().lecture && !answering.current && Date.now() > lectureEar.current ? 'guard' : 'command'
      default:
        // Thinking, tooling, speaking. A confirmation is the one thing he stops
        // for in the middle of a turn, and only once he has finished asking.
        return answering.current ? 'command' : 'guard'
    }
  }

  /**
   * After he answers, whether the next sentence may come without his name.
   *
   * It used to, for fifteen seconds after every answer, so a second request did
   * not need "Jarvis" again. At a shop counter that window caught the customer:
   * he answered them, which opened the window again. So it is a choice now, off
   * unless asked for, and he answers only to his name. A question he asks
   * himself (a confirmation, "repita esse trecho") still waits for the reply.
   */
  const keepEar = () => {
    if (useWorkspace.getState().settings.followUp) voice.current?.arm?.(15000)
  }

  /** Only while he is talking or working, and never over an answer he is waiting for. */
  const mayBarge = () => useWorkspace.getState().settings.bargeIn && !answering.current && ['thinking', 'tooling', 'speaking'].includes(store.getState().phase)

  // -- confirmations --------------------------------------------------------

  const stopAsking = () => {
    answering.current = false
    asker.current?.cancel()
    asker.current = null
    if (keepListening.current) clearInterval(keepListening.current)
    keepListening.current = null
  }

  /**
   * Ask out loud, and only then listen.
   *
   * After, not during: words said over the question would be heard along with it,
   * and the short fast voice keeps the wait small. The fast voice also means a
   * confirmation still gets asked when the cloud voice has run out of quota.
   */
  const putToVoice = async (item: Approval, line: string) => {
    answering.current = false
    const began = Date.now()
    while (speakingAloud() && Date.now() - began < 8000) await new Promise((resolve) => setTimeout(resolve, 120))
    if (approval.current !== item) return
    store.getState().setCaption(line)
    const spk = createSpeaker()
    asker.current = spk
    spk.sayFast(line)
    await spk.end()
    if (approval.current !== item) return
    answering.current = true
    voice.current?.arm?.(30000)
  }

  const onApproval = (item: Approval | null) => {
    stopAsking()
    if (approval.current && !item) store.getState().setCaption('')
    approval.current = item
    doubts.current = 0
    if (!item) return
    void putToVoice(item, approvalQuestion(item.action))
    // The window opened by asking is shorter than the time there is to answer.
    keepListening.current = setInterval(() => { if (answering.current) voice.current?.arm?.(30000) }, 25000)
  }

  const answerApproval = (item: Approval, said: string) => {
    const answer = readAnswer(said)
    if (answer) {
      sfx.play('heard')
      item.decide(answer === 'yes')
      return
    }
    // Twice is enough to ask. After that the card is there and the wait runs out.
    if (doubts.current++ < 2) void putToVoice(item, ASK_AGAIN)
    else voice.current?.arm?.(30000)
  }

  const acceptVoice = (text: string) => {
    if (approval.current) {
      answerApproval(approval.current, text)
      return
    }
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

    // His name alone, while he waits for a yes or a no, is not a new conversation.
    if (approval.current && !trailing) {
      voice.current?.arm?.(30000)
      return
    }

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
  /** Says what just came due, once he is free to. A reminder never talks over him. */
  const spokenAlerts = useRef(loadSpoken())
  /** The full spoken briefing, as the greeting gives it, for a routine that asks for it at a set time. */
  const dayBriefing = async () => {
    const { city, personality, learn, remember } = useWorkspace.getState().settings
    const response = await fetch(`${BRIDGE_HTTP_URL}/assistant/briefing?city=${encodeURIComponent(city.trim())}&first=1&learn=${learn && remember ? 1 : 0}&formal=${personality === 'formal' ? 1 : 0}`, { signal: AbortSignal.timeout(4000) })
    return response.ok ? ((await response.json()) as { line: string }).line : ''
  }
  const checkAlerts = async () => {
    const response = await fetch(`${BRIDGE_HTTP_URL}/assistant/alerts`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return
    const { notifications, timers } = await response.json() as { notifications: Alert[]; timers: Timer[] }
    store.getState().setTimers(timers)
    const before = store.getState().phase
    // In a class it stays on the screen. Nobody wants him speaking up in the room.
    if ((before !== 'listening' && before !== 'dormant') || approval.current || store.getState().lecture) return
    const due = alertsToSpeak(notifications, spokenAlerts.current, Date.now())
    let line = ''
    if (due.length) {
      for (const alert of due) spokenAlerts.current.add(alert.id)
      saveSpoken(spokenAlerts.current)
      // A scheduled briefing is put together now, with the city only the app knows.
      const briefing = due.some((alert) => alert.brief) ? await dayBriefing().catch(() => '') : ''
      line = alertLine(due.map((alert) => (alert.brief && briefing ? { ...alert, say: briefing } : alert)))
    } else line = await nudge(before, timers.length > 0)
    if (!line || store.getState().phase !== before) return

    const mine = ++turn.current
    if (!due.length) store.getState().pushTurn({ id: newId(), role: 'jarvis', text: line })
    const spk = createSpeaker()
    speaker.current = spk
    clearIdle()
    store.getState().setPhase('speaking')
    store.getState().setCaption(line)
    sfx.play('wake')
    // In private mode the words stay on this computer.
    if (useWorkspace.getState().settings.privacyMode) spk.sayFast(line)
    else spk.say(line)
    await spk.end()
    if (mine !== turn.current) return
    speaker.current = null
    if (before === 'dormant') store.getState().setPhase('dormant')
    else listen(FOLLOW_UP_MS)
  }

  /** Whether he has something of his own to bring up. The bridge rations it. */
  const nudgedAt = useRef(0)
  const nudge = async (phase: string, focusing: boolean) => {
    const { initiative, privacyMode } = useWorkspace.getState().settings
    if (phase !== 'listening' || !initiative || privacyMode || focusing || store.getState().quizOn || Date.now() - nudgedAt.current < NUDGE_CHECK_MS) return ''
    // Not over somebody else's conversation. Checked before the bridge is
    // asked, so the day's one remark is not used up on a busy room.
    if (Date.now() - lastRoomSpeech() < ROOM_QUIET_MS) return ''
    nudgedAt.current = Date.now()
    const response = await fetch(`${BRIDGE_HTTP_URL}/assistant/nudge`, { signal: AbortSignal.timeout(3000) })
    return response.ok ? (await response.json() as { say: string }).say : ''
  }

  const onSpeechStart = () => {
    // The answer he asked for. Treated as an interruption, a "sim" would cancel
    // the very action it was approving.
    if (answering.current) return
    clearIdle()
    const phase = store.getState().phase
    if (store.getState().lecture && phase === 'listening') {
      lectureEar.current = Date.now() + LECTURE_EAR_MS
      sfx.play('wake')
      return
    }
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
    const said = text.replace(LEADING_NAME, '').trim()
    if (BARE_NAME.test(text) || !said) {
      if (approval.current) voice.current?.arm?.(30000)
      else listen(AWAIT_SPEECH_MS)
      return
    }

    acceptVoice(said)
  }

  const onClarification = (text: string) => {
    if (approval.current) {
      answerApproval(approval.current, '')
      return
    }
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
    voice.current = await startVoice({ mode, mayBarge, onWake, onSpeechStart, onPartial, onUtterance, onClarification, onError: onVoiceError })
    listen(AWAIT_SPEECH_MS)
  }

  privacyActions.current = { goDormant, startVoiceLoop, onVoiceError }
  useEffect(() => {
    const actions = privacyActions.current
    if (privacyMode) {
      // Stopping here and not finishing: finishing would send the words out.
      void recording.current?.stop(false)
      recording.current = null
      useStore.getState().setLecture(null)
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
        case 'personality':
          if (['formal', 'equilibrado', 'bem-humorado', 'sarcastico'].includes(a.value)) useWorkspace.getState().setSettings({ personality: a.value })
          break
        case 'cinema':
          setCinema(a.on === true)
          break
        case 'spectacle':
          if (['fusao', 'meteoros', 'abertura'].includes(a.kind)) requestSpectacle(a.kind)
          break
        case 'initiative':
          useWorkspace.getState().setSettings({ initiative: a.on === true })
          break
        case 'feeling':
          s.feel(a.kind)
          break
        case 'study':
          s.setQuizOn(a.quiz === true)
          break
        case 'lecture':
          if (a.action === 'start') void beginLecture(args).catch((error: Error) => s.setError(`Não consegui começar a gravar: ${error.message}`))
          else if (a.action === 'show') s.pushBlade({ id: `aula-${a.id}`, title: String(a.title), kind: 'markup', html: String(a.html), size: 'tall', hold: 'sticky' })
          break
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
    if (store.getState().lecture) lectureEar.current = Date.now() + LECTURE_EAR_MS
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
    const unwatchApproval = watchApproval(onApproval)
    const alertTimer = setInterval(() => { void checkAlerts().catch(() => { /* The bridge restarts now and then. */ }) }, 5000)
    const stopLecture = () => { void endLecture() }
    window.addEventListener('jarvis:end-lecture', stopLecture)

    const onKey = createShortcutHandler({
      // V auditions the next voice installed on this machine. Which ones exist
      // varies per computer, so hearing them beats trusting a ranking.
      nextVoice: () => {
        const name = cycleVoice()
        store.getState().setVoice(name)
        silence()
        const demo = createSpeaker()
        speaker.current = demo
        demo.say('Voz em português selecionada. À sua disposição, senhor.')
        void demo.end()
      },
      // T bypasses the wake word, the recogniser and the model entirely, and
      // prints the verdict rather than making you infer it.
      testAudio: () => {
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
      },
      standDown: () => { if (store.getState().phase !== 'offline') goDormant() },
      activate,
    })
    window.addEventListener('keydown', onKey)

    return () => {
      clearInterval(meter)
      hotkey?.()
      window.removeEventListener('keydown', onKey)
      clearIdle()
      clearClarification()
      voice.current?.stop()
      speaker.current?.cancel()
      unwatchApproval()
      stopAsking()
      clearInterval(alertTimer)
      window.removeEventListener('jarvis:end-lecture', stopLecture)
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
