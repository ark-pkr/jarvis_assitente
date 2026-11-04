import { BRIDGE_HTTP_URL } from '../config'
import { getMic } from './audio'
import { speakingNow } from './tts'
import { startVad, type Vad } from './vad'
import { openLiveStt, type LiveAnswer, type LiveMiss, type LiveStt } from './liveStt'
import { caps } from './capabilities'
import { useWorkspace } from '../workspace'
import { isExplicitInterruption } from './voiceGuard'
import { WAKE, WAKE_DEBOUNCE, afterWake, isEcho, makeAssembler } from './utterance'
import { diag, drop } from './voiceDiag'
import { startBrowserVoice } from './browserVoice'

export { diag } from './voiceDiag'
import { createSpeakerRecognizer, profileFromBase64, scoreSpeaker } from './speakerIdentity'
import { segmentMaySend, startLocalWake, type LocalWake } from './localWake'
import type { Eagle, EagleProfile } from '@picovoice/eagle-web'

/**
 * The voice loop.
 *
 * One recogniser, running for the life of the page. It is never torn down for
 * a turn, and that single fact is most of what separates this from a kiosk:
 * the microphone is still open while JARVIS is talking, so you can cut him off
 * the way you would cut off a person.
 *
 * The obvious design — one recogniser hunting for the wake word, a second one
 * capturing the command, stopping the first to start the second because the
 * browser only hands out one at a time — is what this replaces. It works, but
 * nothing is listening during an answer, so barge-in is impossible, and every
 * restart leaves a quarter-second of deafness that eats whole wake words.
 *
 * Keeping the mic open costs one thing: JARVIS hears himself through the
 * speakers. Residual echo is filtered at the transcript level in `isEcho`,
 * regardless of which speech service produced the transcript.
 */

export type VoiceMode =
  /** Powered down. Only his name matters. */
  | 'wake'
  /** He is expecting you to speak. Everything is a command. */
  | 'command'
  /** He is thinking or talking. Anything you say is an interruption. */
  | 'guard'
  /** Something is playing that must not be transcribed at all. */
  | 'deaf'

export type VoiceHandlers = {
  /** Read fresh on every result, so the app never has to re-subscribe. */
  mode: () => VoiceMode
  /** Fired on his name, from a partial — waiting for endpointing feels slow.
   *  `trailing` is whatever followed it, so "Jarvis, what's the weather" is
   *  one breath rather than two turns. */
  onWake: (trailing: string) => void
  /** Whether plain speech may cut him off now, without his name. */
  mayBarge?: () => boolean
  /** The user has genuinely started talking. This is the barge-in trigger. */
  onSpeechStart: () => void
  /** Live transcript, for the caption under the reactor. */
  onPartial: (text: string) => void
  /** A complete, endpointed utterance. */
  onUtterance: (text: string) => void
  /** One unclear transcript segment that can be repeated before any command runs. */
  onClarification: (text: string) => void
  /** The recogniser is unusable. Distinct from the user saying nothing. */
  onError: (message: string) => void
}

export type Voice = {
  arm?: (windowMs?: number, bypassIdentity?: boolean) => void
  stop: () => void
  /** True while a recogniser is actually running. */
  live: () => boolean
}


/**
 * Pick the voice engine and start it.
 *
 * The bridge selects Gemini transcription in the Windows app and ElevenLabs
 * Scribe in the browser. Browser SpeechRecognition is only a keyless web
 * fallback; Electron's Chromium implementation depends on an external service
 * and is not a reliable recovery path for a failed Gemini request.
 *
 * The microphone is opened once here so a denied permission is reported loudly
 * rather than surfacing later as an unexplained deafness, whichever engine runs.
 */
export async function startVoice(h: VoiceHandlers): Promise<Voice> {
  try {
    await getMic()
  } catch (err) {
    diag.lastError = 'mic'
    h.onError(
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Acesso ao microfone negado. Permita o microfone no navegador ou digite seu pedido.'
        : 'Nenhum microfone disponível. Conecte um microfone ou digite seu pedido.',
    )
    return { stop: () => {}, live: () => false }
  }
  diag.engine = caps().stt
    ? (window.jarvisDesktop ? 'gemini' : 'elevenlabs')
    : (window.jarvisDesktop ? 'unavailable' : 'browser')
  if (window.jarvisDesktop && !caps().stt) {
    h.onError('O reconhecimento Gemini não está disponível. Verifique a chave em Histórico e ajustes → Aplicativo e a conexão com o serviço local.')
    return { stop: () => {}, live: () => false }
  }

  let current: Voice | null = null
  const delegate = (voice: Voice) => { current = voice }

  const primary = caps().stt
    ? await startBridgeVoice(h, window.jarvisDesktop ? undefined : delegate)
    : startBrowserVoice(h)
  current = primary

  return {
    arm: (windowMs, bypassIdentity) => current?.arm?.(windowMs, bypassIdentity),
    stop: () => current?.stop(),
    live: () => current?.live() ?? false,
  }
}

function isTransientSttFailure(err: unknown): boolean {
  if (!err) return false
  const text = String(err)
  return /timed out|timeout|AbortError|Failed to fetch|fetch failed|NetworkError|ERR_NETWORK|ECONNRESET|502|503|504/i.test(text)
    || (err instanceof DOMException && ['TimeoutError', 'AbortError'].includes(err.name))
}

/** Local VAD + bridge transcription (Gemini in Electron, ElevenLabs in web). */
async function startBridgeVoice(h: VoiceHandlers, onFallback?: (voice: Voice) => void): Promise<Voice> {
  let lastWake = 0
  let vad: Vad | null = null
  let speakerRecognizer: Eagle | null = null
  let speakerProfile: EagleProfile | null = null
  let speakerSetup: Promise<void> | null = null
  let manualUntil = 0
  let identityWarningAt = 0
  let stopped = false
  const captureAbort = new AbortController()
  let addressedUntil = 0
  let generation = 0
  let localWake: LocalWake | null = null
  /** Whether the segment being captured began inside a follow-up window. */
  let addressedAtStart = false

  /**
   * Segments waiting for the transcriber, oldest first.
   *
   * This was a boolean — `if (transcribing) return` — and that single line was
   * the worst bug in the pause story. Segments arrive faster than Scribe
   * answers whenever someone speaks in bursts, which is exactly what pausing
   * mid-sentence looks like, so the second half of the thought was not merely
   * mis-timed, it was silently discarded. Queue instead: nothing a person says
   * out loud gets thrown away because the network was busy.
   *
   * Order is preserved because the drain is single-flight, which matters —
   * "London" arriving before "what's the weather in" is worse than either.
   */
  const pendingAudio: { blob: Blob; generation: number; at: number; addressed: boolean; streamed: Promise<LiveAnswer | LiveMiss> | null }[] = []
  /** The segment being transcribed as it is said, once it may leave the machine. */
  let stream: LiveStt | null = null
  /** Its audio from the moment it began, until it is allowed to go. */
  let unsent: Float32Array[] = []
  /** After a failure the ordinary path is the reliable one for a while. */
  let streamRetryAt = 0
  const closeStream = () => { stream?.abort(); stream = null; unsent = [] }
  let draining = false

  /**
   * Transcripts become turns here rather than one-per-segment.
   * See makeAssembler for why.
   */
  const assemble = makeAssembler({
    emit: (text) => {
      diag.dropped = ''
      diag.accepted++
      diag.holding = ''
      h.onUtterance(text)
    },
    partial: (text) => h.onPartial(text),
  })

  /**
   * Send one captured segment to the bridge and act on the words.
   *
   * The mode is re-read here, not at capture time, because a barge-in flips the
   * machine from 'guard' to 'listening' between the segment starting and its
   * transcript arriving — and the transcript belongs to the mode the user is in
   * now, not the one they interrupted.
   */
  const transcribe = async ({ blob, generation: captured, at, addressed, streamed }: (typeof pendingAudio)[number]) => {
    if (captured !== generation || Date.now() - at > 120000) return
    if (stopped || h.mode() === 'deaf') return
    const mode = h.mode()
    const settings = useWorkspace.getState().settings
    if (window.jarvisDesktop && settings.voiceIdentityRequired && Date.now() > manualUntil) {
      try {
        if (!speakerRecognizer || !speakerProfile) {
          if (!speakerSetup) speakerSetup = (async () => {
            const identity = await window.jarvisDesktop!.voiceIdentityMaterial()
            if (!identity) throw new Error('Cadastre seu perfil em Histórico e ajustes → Áudio antes de usar comandos por voz.')
            const recognizer = await createSpeakerRecognizer(identity.accessKey)
            if (stopped) { await recognizer.release(); return }
            try {
              speakerProfile = profileFromBase64(identity.profile)
              speakerRecognizer = recognizer
            } catch (error) {
              await recognizer.release()
              throw error
            }
          })()
          try { await speakerSetup } finally { speakerSetup = null }
        }
        if (stopped || captured !== generation) return
        if (!speakerRecognizer || !speakerProfile) throw new Error('O perfil de voz não foi carregado.')
        const match = await scoreSpeaker(blob, speakerRecognizer, speakerProfile, settings.speakerThreshold)
        if (!match.accepted) {
          drop(match.score === null ? 'voz insuficiente para identificação local' : `perfil de voz não reconhecido (${match.score.toFixed(2)})`)
          if (mode !== 'guard') h.onPartial(match.score === null ? 'Não consegui confirmar a voz. Fale mais perto do microfone ou pressione Espaço.' : 'Voz não reconhecida. Pressione Espaço para ativar manualmente.')
          return
        }
      } catch (error) {
        drop('verificação local de voz indisponível')
        if (Date.now() - identityWarningAt > 10_000) {
          identityWarningAt = Date.now()
          h.onError(error instanceof Error ? error.message : 'A verificação local de voz falhou. Nenhum áudio foi enviado.')
        }
        return
      }
    } else if (Date.now() <= manualUntil) {
      manualUntil = 0
    }
    const t0 = performance.now()
    try {
      const live = streamed ? await streamed : null
      const answer = live && 'text' in live ? live : null
      // A live session that failed sits out a minute; one that only heard no speech does not.
      if (live && 'quiet' in live && !live.quiet) streamRetryAt = Date.now() + 60000
      if (stopped || captured !== generation) return
      let res = answer ? new Response(JSON.stringify(answer)) : null
      if (!res) for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetch(`${BRIDGE_HTTP_URL}/stt`, {
            method: 'POST',
            headers: { 'content-type': blob.type || 'audio/webm' },
            body: blob,
            signal: AbortSignal.any([captureAbort.signal, AbortSignal.timeout(50000)]),
          })
        } catch (err) {
          if (attempt > 0 || stopped || captureAbort.signal.aborted || !isTransientSttFailure(err)) throw err
          await new Promise((resolve) => setTimeout(resolve, 800))
          continue
        }
        if (attempt === 0 && [502, 503, 504].includes(res.status)) {
          await res.arrayBuffer()
          await new Promise((resolve) => setTimeout(resolve, 800))
          continue
        }
        break
      }
      if (!res) throw new Error('A transcrição não retornou uma resposta.')
      diag.idleMs = Math.round(performance.now() - t0)
      if (!res.ok) {
        diag.transcriptionFailures++
        diag.lastError = `stt ${res.status}`
        drop(`transcription failed (${res.status})`)
        const message = res.status === 429
          ? 'Limite de transcrição atingido. Verifique a cota Gemini.'
          : [401, 403].includes(res.status)
            ? 'A chave Gemini foi recusada. Verifique a configuração em Histórico e ajustes → Aplicativo.'
            : res.status === 504
              ? 'A transcrição Gemini demorou demais. Verifique a conexão e tente novamente.'
              : 'O serviço de transcrição está indisponível. Verifique a conexão e a configuração Gemini.'
        h.onError(message)
        return
      }
      const { text, clarification } = (await res.json()) as { text?: string; clarification?: string }
      if (stopped || captured !== generation) return
      if (mode === 'deaf') return
      const said = (text ?? '').trim()
      diag.lastError = ''

      if (!said) {
        drop('nothing intelligible in the segment')
        if (mode !== 'guard' && clarification) h.onClarification(clarification)
        else if (mode !== 'guard') h.onPartial('Não entendi com clareza. Diga “Jarvis” e repita o pedido completo.')
        return
      }
      if (mode === 'guard') {
        if (isExplicitInterruption(said)) { assemble.cancel(); h.onSpeechStart() }
        else drop('resposta em andamento; aguardando comando explícito para interromper')
        return
      }

      // His own voice, come back through the microphone. The raised guard
      // threshold stops most of it at the door; this catches the rest.
      if (isEcho(said, speakingNow())) {
        drop('echo of his own voice')
        return
      }

      diag.heard = said
      diag.heardAt = Date.now()
      if (window.jarvisDesktop) {
        if (WAKE.test(said)) {
          // Local detection already answered to the name, so the transcript of
          // the same breath is the command rather than a second call.
          if (!localWake && Date.now() - lastWake <= WAKE_DEBOUNCE) {
            drop('wake word repeated too quickly')
            return
          }
          lastWake = Date.now()
          diag.accepted++
          diag.dropped = ''
          const command = afterWake(said)
          if (!localWake) diag.wakes++
          if (!command) { addressedUntil = Date.now() + 30000; if (!localWake) h.onWake(''); return }
          addressedUntil = 0; h.onWake(command); return
        }
        if (mode !== 'command' || (Date.now() > addressedUntil && !addressed)) {
          drop('fala não dirigida ao Jarvis'); h.onPartial('Diga “Jarvis” antes do seu pedido.'); return
        }
        addressedUntil = 0
      }

      if (mode === 'wake') {
        if (WAKE.test(said) && Date.now() - lastWake > WAKE_DEBOUNCE) {
          lastWake = Date.now()
          diag.wakes++
          diag.dropped = ''
          diag.accepted++
          h.onWake(afterWake(said))
        } else {
          drop(`heard "${said.slice(-40)}" — not his name`)
        }
        return
      }

      // Not a turn yet — a piece of one. The assembler decides when the thought
      // is finished, reading the words and whether the room is still noisy.
      assemble.feed(said, vad?.meter().speaking ?? false)
    } catch (err) {
      if (stopped) return
      if (isTransientSttFailure(err) && onFallback && !useWorkspace.getState().settings.voiceIdentityRequired) {
        stopped = true
        captureAbort.abort()
        pendingAudio.length = 0
        clearInterval(guardPoll)
        assemble.cancel()
        vad?.stop()
        diag.running = false
        diag.engine = 'browser'
        diag.lastError = 'stt timeout; falling back to browser speech recognition'
        h.onError('Servidor de voz não respondeu. Reativando reconhecimento do navegador.')
        const next = startBrowserVoice(h)
        onFallback(next)
        return
      }
      diag.transcriptionFailures++
      diag.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      drop('could not reach the speech service')
      h.onError(window.jarvisDesktop
        ? 'Não foi possível transcrever agora. O JARVIS continuará ouvindo; verifique a conexão e a cota Gemini.'
        : 'Não foi possível transcrever agora. Verifique a conexão e tente novamente.')
    }
  }

  /** One transcription at a time, in the order the segments were spoken. */
  const drain = async () => {
    if (draining) return
    draining = true
    try {
      while (!stopped && pendingAudio.length) {
        await transcribe(pendingAudio.shift()!)
      }
    } finally {
      draining = false
    }
  }

  const mayLeave = () => segmentMaySend({ localWake: Boolean(localWake), heldText: Boolean(assemble.held()), addressedAtStart, addressedUntil, now: Date.now() })

  vad = await startVad({
    mayBarge: h.mayBarge,
    onBarge: () => {
      addressedUntil = Date.now() + 30000
      addressedAtStart = true
      h.onSpeechStart()
    },
    onStart: () => {
      const mode = h.mode()
      diag.mode = mode
      diag.sessions++
      if (mode === 'deaf') return
      addressedAtStart = Date.now() <= addressedUntil
      // Standing down mid-thought throws the thought away with it. Otherwise
      // held text would surface as the opening of the *next* conversation.
      if (mode === 'wake') assemble.cancel()
      closeStream()
      // The barge-in. In guard mode the user has started talking over him, and
      // because the guard threshold is high this is a real interruption rather
      // than leaked playback — so cut him off now, do not wait for the words.
      // Energy alone can be JARVIS's own playback. Wait for an explicit
      // named interruption in the transcription before cancelling a reply.
    },
    // Same rule as a finished segment: it stays here until it is addressed to
    // him. Words said before his name wait, and go only if the name comes.
    onSegment: (samples, rate) => {
      if (!window.jarvisDesktop || useWorkspace.getState().settings.voiceIdentityRequired || Date.now() < streamRetryAt) return
      if (['guard', 'deaf'].includes(h.mode())) return
      unsent.push(samples)
      if (!mayLeave()) return
      stream ??= openLiveStt()
      for (const chunk of unsent) stream.feed(chunk, rate)
      unsent = []
    },
    onDiscard: closeStream,
    onEnd: (blob) => {
      const streaming = stream
      stream = null
      unsent = []
      if (stopped || ['guard', 'deaf'].includes(h.mode())) { streaming?.abort(); return }
      if (!mayLeave()) {
        drop('sem a palavra de ativação; nada foi enviado')
        streaming?.abort()
        return
      }
      if (pendingAudio.length >= 2) { streaming?.abort(); pendingAudio.length = 0; generation++; return }
      pendingAudio.push({ blob, generation, at: Date.now(), addressed: addressedAtStart, streamed: streaming?.finish() ?? null })
      void drain()
    },
    onAudio: (samples, rate) => localWake?.feed(samples, rate),
    onLevel: (v) => {
      // Only paint the live level while actually listening for a command, so a
      // dormant reactor stays calm and does not twitch at every room noise.
      const mode = h.mode()
      if (mode !== 'command') return
      // Never over the assembled text. This used to run unconditionally and
      // overwrote a half-built sentence with an ellipsis sixty times a second,
      // so a pause looked like the interface had forgotten what you just said.
      if (assemble.held()) return
      h.onPartial(v > 0.04 ? '…' : '')
    },
    onError: (message) => {
      diag.lastError = 'capture'
      diag.running = false
      h.onError(message)
    },
  })
  diag.running = vad.live()

  /**
   * His name, heard on this machine. Started after the capture is up and never
   * awaited by it: an invalid key or a dead network costs this feature alone,
   * and the transcription path keeps working exactly as it did.
   */
  const heardName = () => {
    const mode = h.mode()
    if (stopped || mode === 'deaf' || Date.now() - lastWake <= WAKE_DEBOUNCE) return
    if (mode === 'guard' && /jarv/i.test(speakingNow())) return
    lastWake = Date.now()
    diag.wakes++
    addressedUntil = Date.now() + 30000
    addressedAtStart = true
    if (mode === 'guard') h.onSpeechStart()
    else if (mode === 'wake') h.onWake('')
  }
  const wakeKey = window.jarvisDesktop ? await window.jarvisDesktop.wakeKey().catch(() => '') : ''
  if (wakeKey) void startLocalWake(wakeKey, heardName).then((engine) => {
    if (stopped) engine.stop()
    else { localWake = engine; diag.localWake = true }
  }).catch((error) => {
    console.warn('[jarvis] local wake word unavailable:', error)
    diag.lastError = 'palavra de ativação local indisponível'
    h.onError('Não foi possível iniciar a detecção local de “Jarvis”. Confira a chave Picovoice; por enquanto, a transcrição continua pelo Gemini.')
  })

  // Raise the trigger bar exactly while he speaks. The mode is polled rather
  // than pushed because nothing in the app pushes phase changes here, and a
  // 200ms lag on the echo gate is imperceptible.
  let previousMode = h.mode()
  const guardPoll = setInterval(() => {
    const mode = h.mode()
    vad?.setGuard(mode === 'guard' || mode === 'deaf')
    if (mode !== previousMode && (mode === 'guard' || mode === 'deaf')) { generation++; addressedUntil = 0; pendingAudio.length = 0; assemble.cancel(); closeStream() }
    previousMode = mode
    // He has stood down — by Escape, by the idle timeout, or by dropping back
    // to the wake word. Anything half-said belonged to a conversation that is
    // over, and letting the hold expire later would open the next one with a
    // fragment of the last.
    if ((mode === 'wake' || mode === 'deaf') && assemble.held()) assemble.cancel()
  }, 200)

  return {
    arm: (windowMs = 30000, bypassIdentity = false) => {
      addressedUntil = Date.now() + Math.max(5000, Math.min(30000, windowMs))
      if (bypassIdentity) manualUntil = addressedUntil
    },
    stop: () => {
      stopped = true
      captureAbort.abort()
      pendingAudio.length = 0
      closeStream()
      clearInterval(guardPoll)
      assemble.cancel()
      vad?.stop()
      localWake?.stop()
      localWake = null
      diag.localWake = false
      void speakerRecognizer?.release()
      speakerRecognizer = null
      speakerProfile = null
      diag.running = false
    },
    live: () => vad?.live() ?? false,
  }
}
