import { getMic, startAnalyser } from './audio'
import { speakingNow } from './tts'
import { useWorkspace } from '../workspace'
import { isExplicitInterruption } from './voiceGuard'
import { WAKE, WAKE_DEBOUNCE, afterWake, isEcho, makeAssembler } from './utterance'
import { diag, drop } from './voiceDiag'
import type { Voice, VoiceHandlers } from './voice'

/* -------------------------------------------------------------------------- */
/* Browser fallback: SpeechRecognition                                        */
/* -------------------------------------------------------------------------- */

/**
 * The keyless web path. Uses the browser's own SpeechRecognition for both
 * detection and transcription. Restarts only after an API end/start failure;
 * silence is not treated as a dead recogniser.
 */
export function startBrowserVoice(h: VoiceHandlers): Voice {
  const Ctor =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  if (!Ctor) {
    h.onError('Este navegador não oferece reconhecimento de voz. Abra no Chrome ou Edge, ou digite seu pedido abaixo.')
    return { stop: () => {}, live: () => false }
  }

  let stopped = false
  let running = false
  let rec: any = null
  let settled = ''
  let interim = ''
  let started = false
  let lastWake = 0
  let lastAlive = Date.now()
  let restartDelay = 250
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let reportedError = ''
  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  /** Same assembly rules as the premium path — a pause is not a full stop. */
  const assemble = makeAssembler({
    emit: (text) => {
      diag.dropped = ''
      diag.accepted++
      diag.holding = ''
      h.onUtterance(text)
    },
    partial: (text) => h.onPartial(text),
  })

  const touch = () => {
    lastAlive = Date.now()
  }

  const scheduleRestart = () => {
    if (stopped || restartTimer) return
    const delay = restartDelay
    restartDelay = Math.min(15000, restartDelay * 2)
    diag.restarts++
    restartTimer = setTimeout(() => {
      restartTimer = null
      spin()
    }, delay)
  }

  const clearSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer)
    silenceTimer = null
  }

  const reset = () => {
    clearSilence()
    settled = ''
    interim = ''
    started = false
  }

  const emit = () => {
    const text = `${settled} ${interim}`.replace(/\s+/g, ' ').trim()
    const mode = h.mode()
    reset()
    if (!text || mode === 'deaf') return
    if (isEcho(text, speakingNow())) {
      drop('echo of his own voice')
      return
    }
    diag.heard = text
    diag.heardAt = Date.now()
    if (mode === 'wake') {
      assemble.cancel()
      if (WAKE.test(text) && Date.now() - lastWake > WAKE_DEBOUNCE) {
        lastWake = Date.now()
        diag.wakes++
        diag.dropped = ''
        diag.accepted++
        h.onWake(afterWake(text))
      } else {
        drop(`heard "${text.slice(-40)}" — not his name`)
      }
      return
    }
    // The recogniser has already endpointed on its own 900ms gap; the assembler
    // decides whether that gap actually ended the thought. `false` because a
    // result only reaches here once the recogniser has gone quiet.
    assemble.feed(text, false)
  }

  const bumpSilence = () => {
    clearSilence()
    // Endpoint on a short quiet gap; the ElevenLabs path tunes this more
    // finely, but a fixed window is plenty for the fallback.
    silenceTimer = setTimeout(emit, Math.max(700, Math.min(2500, useWorkspace.getState().settings.speechPause * 1000)))
  }

  const onResult = (e: any) => {
    touch()
    restartDelay = 250
    reportedError = ''
    const mode = h.mode()
    diag.mode = mode
    if (mode === 'deaf') {
      interim = ''
      return
    }
    let fresh = ''
    interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript as string
      if (e.results[i].isFinal) fresh = `${fresh} ${chunk}`.trim()
      else interim = `${interim} ${chunk}`.trim()
    }
    const heard = `${settled} ${fresh} ${interim}`.replace(/\s+/g, ' ').trim()
    if (!heard) return
    if (mode === 'guard') {
      reset()
      assemble.cancel()
      if (isExplicitInterruption(heard)) h.onSpeechStart()
      else drop('resposta em andamento; ruído ou fala não interrompe automaticamente')
      return
    }
    if (isEcho(`${fresh} ${interim}`, speakingNow())) {
      interim = ''
      return
    }

    if (mode === 'wake') {
      settled = `${settled} ${fresh}`.trim()
      if (WAKE.test(heard) && Date.now() - lastWake > WAKE_DEBOUNCE) {
        lastWake = Date.now()
        diag.wakes++
        const trailing = afterWake(heard)
        reset()
        h.onWake(trailing)
      } else if (settled.length > 400) {
        settled = ''
      }
      return
    }

    settled = `${settled} ${fresh}`.trim()
    const full = `${settled} ${interim}`.replace(/\s+/g, ' ').trim()
    if (!started) {
      started = true
      h.onSpeechStart()
    }
    diag.dropped = ''
    // Show the whole thought, not just the fragment being spoken now — there
    // may be an earlier half of it held by the assembler.
    const carried = assemble.held()
    h.onPartial(carried ? `${carried} ${full}` : full)
    bumpSilence()
  }

  const spin = () => {
    if (stopped || running || rec) return
    let instance: any
    try {
      instance = new Ctor()
    } catch (error) {
      diag.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      scheduleRestart()
      return
    }
    rec = instance
    instance.continuous = true
    instance.interimResults = true
    instance.lang = 'pt-BR'
    instance.maxAlternatives = 3
    instance.onstart = () => {
      running = true
      diag.running = true
      diag.sessions++
      touch()
    }
    instance.onresult = onResult
    instance.onerror = (ev: any) => {
      diag.lastError = String(ev.error ?? '')
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        stopped = true
        diag.running = false
        if (restartTimer) clearTimeout(restartTimer)
        restartTimer = null
        h.onError('Microfone bloqueado. Permita o microfone no ícone ao lado do endereço e recarregue a página. Você também pode digitar seu pedido.')
      } else if (ev.error === 'network') {
        if (reportedError !== ev.error) h.onError('Não foi possível conectar ao reconhecimento de voz. Verifique a conexão ou digite seu pedido abaixo.')
      } else if (ev.error === 'audio-capture') {
        if (reportedError !== ev.error) h.onError('Microfone não encontrado. Conecte um microfone e verifique o dispositivo de entrada do navegador.')
      }
      reportedError = String(ev.error ?? '')
    }
    instance.onend = () => {
      if (rec !== instance) return
      running = false
      diag.running = false
      touch()
      rec = null
      if (!stopped) scheduleRestart()
    }
    try {
      instance.start()
    } catch (error) {
      if (rec === instance) rec = null
      running = false
      diag.running = false
      diag.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      scheduleRestart()
    }
  }

  spin()

  const deviceChanged = () => {
    if (stopped) return
    void getMic().then(() => startAnalyser()).catch(() => h.onError('Não foi possível reabrir o microfone. Verifique o dispositivo de entrada.'))
    try { rec?.abort() } catch { /* onend restarts the recognizer */ }
  }
  navigator.mediaDevices?.addEventListener('devicechange', deviceChanged)

  // Silence is normal during wake-word listening; only recover when the API
  // actually ends or fails to start, not because no transcript arrived.
  const health = setInterval(() => { diag.idleMs = Date.now() - lastAlive }, 1000)

  return {
    stop: () => {
      stopped = true
      clearInterval(health)
      if (restartTimer) clearTimeout(restartTimer)
      restartTimer = null
      navigator.mediaDevices?.removeEventListener('devicechange', deviceChanged)
      clearSilence()
      assemble.cancel()
      diag.running = false
      try {
        rec?.abort()
      } catch {
        /* noop */
      }
    },
    live: () => running,
  }
}
