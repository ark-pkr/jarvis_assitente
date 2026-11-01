import { useEffect, useRef, useState } from 'react'
import type { EagleProfiler } from '@picovoice/eagle-web'
import { createSpeakerProfiler, enrollUtterance, profileToBase64, wavToPcm16 } from '../lib/speakerIdentity'
import { startVad, type Vad } from '../lib/vad'
import { useWorkspace } from '../workspace'

export function VoiceIdentitySettings({ onPauseVoice, onResumeVoice }: { onPauseVoice: () => void; onResumeVoice: () => void }) {
  const workspace = useWorkspace()
  const [accessKey, setAccessKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const profiler = useRef<EagleProfiler | null>(null)
  const vad = useRef<Vad | null>(null)
  const processing = useRef(false)
  const mounted = useRef(true)
  const busyRef = useRef(false)
  const generation = useRef(0)
  const resumeRef = useRef(onResumeVoice)
  resumeRef.current = onResumeVoice

  useEffect(() => {
    mounted.current = true
    void window.jarvisDesktop?.voiceIdentityStatus()
      .then((status) => { if (mounted.current) { setConfigured(status.configured); setEnrolled(status.enrolled) } })
      .catch(() => { if (mounted.current) setMessage('Não foi possível consultar a proteção de voz.') })
    return () => {
      mounted.current = false
      const resume = busyRef.current
      busyRef.current = false
      generation.current++
      vad.current?.stop()
      vad.current = null
      const current = profiler.current
      void (async () => {
        while (processing.current) await new Promise((resolve) => setTimeout(resolve, 50))
        if (profiler.current === current) profiler.current = null
        await current?.release()
      })()
      if (resume) resumeRef.current()
    }
  }, [])

  const stopEnrollment = async (resume = true, waitForProcessing = true) => {
    generation.current++
    busyRef.current = false
    vad.current?.stop()
    vad.current = null
    if (waitForProcessing) {
      while (processing.current) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const current = profiler.current
    profiler.current = null
    if (current) await current.release()
    if (mounted.current) setBusy(false)
    if (resume) onResumeVoice()
  }

  const beginEnrollment = async () => {
    if (!window.jarvisDesktop) {
      setMessage('O cadastro local de voz está disponível no aplicativo desktop para Windows.')
      return
    }
    onPauseVoice()
    const mine = ++generation.current
    busyRef.current = true
    setBusy(true)
    setProgress(0)
    setMessage('Inicializando o cadastro local de voz. Aguarde...')
    try {
      const key = accessKey.trim()
      if (key.length < 20) throw new Error('Informe sua chave de acesso Picovoice.')
      const next = await createSpeakerProfiler(key)
      if (generation.current !== mine || !busyRef.current) { await next.release(); return }
      profiler.current = next
      setMessage('Diga algumas frases em voz natural, uma por vez, em um ambiente silencioso.')
      const capture = await startVad({
        onStart: () => { if (mounted.current) setMessage('Capturando sua frase. Fale normalmente até concluir.') },
        onEnd: (audio) => {
          if (processing.current || !profiler.current) return
          processing.current = true
          void (async () => {
            try {
              const pcm = await wavToPcm16(audio, profiler.current!.sampleRate)
              let amount = await enrollUtterance(profiler.current!, pcm)
              if (pcm.length >= profiler.current!.frameLength) amount = Math.max(amount, await profiler.current!.flush())
              if (!mounted.current || !profiler.current) return
              setProgress(Math.round(amount))
              if (amount >= 100) {
                const profile = await profiler.current.export()
                if (!mounted.current) return
                await window.jarvisDesktop!.saveVoiceIdentity({ accessKey: key, profile: profileToBase64(profile) })
                setConfigured(true)
                setEnrolled(true)
                setAccessKey('')
                workspace.setSettings({ voiceIdentityRequired: true })
                setMessage('Perfil salvo com proteção do Windows. A verificação local foi ativada.')
                await stopEnrollment(false, false)
                onResumeVoice()
              } else {
                setMessage(`Perfil ${Math.round(amount)}% concluído. Continue com outra frase em voz natural.`)
              }
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Não foi possível processar a frase.')
              await stopEnrollment(true, false)
            } finally { processing.current = false }
          })()
        },
        onLevel: () => {},
        onError: (error) => { if (mounted.current) { setMessage(error); void stopEnrollment() } },
      })
      if (generation.current !== mine || !busyRef.current) capture.stop()
      else vad.current = capture
    } catch (error) {
      await stopEnrollment()
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o cadastro de voz.')
    }
  }

  const clearProfile = async () => {
    setBusy(true)
    onPauseVoice()
    try {
      await window.jarvisDesktop?.clearVoiceIdentity()
      setConfigured(false)
      setEnrolled(false)
      setProgress(0)
      workspace.setSettings({ voiceIdentityRequired: false })
      setMessage('Perfil de voz e chave apagados deste aplicativo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível apagar o perfil.')
    } finally { setBusy(false); onResumeVoice() }
  }

  return <>
    <h3>Proteção de voz</h3>
    <p>O JARVIS compara sua voz no computador antes de enviar uma fala ao serviço de transcrição. O áudio bruto do cadastro não é salvo; o perfil e a chave ficam protegidos pelo Windows. A verificação reduz interferências, mas pode errar e não substitui autenticação segura.</p>
    <label>Chave pessoal Picovoice<input aria-label="Chave Picovoice" type="password" autoComplete="off" maxLength={200} value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder={configured ? 'Informe novamente apenas para recadastrar' : 'Obtenha em console.picovoice.ai'} /></label>
    <div className="workspace-row">
      {!busy
        ? <button disabled={!window.jarvisDesktop || !accessKey.trim()} onClick={() => void beginEnrollment()}>{enrolled ? 'Recadastrar minha voz' : 'Cadastrar minha voz'}</button>
        : <button onClick={() => void stopEnrollment()}>Cancelar cadastro</button>}
      {enrolled && <button className="danger" disabled={busy} onClick={() => void clearProfile()}>Apagar perfil de voz</button>}
    </div>
    {busy && <progress aria-label="Progresso do cadastro de voz" max="100" value={progress} />}
    <p role="status">{message || (enrolled ? 'Perfil de voz cadastrado.' : 'Nenhum perfil cadastrado.')}</p>
    {enrolled && <label className="setting-check"><input type="checkbox" checked={workspace.settings.voiceIdentityRequired} onChange={(event) => workspace.setSettings({ voiceIdentityRequired: event.target.checked })} />Aceitar comandos por voz somente após reconhecer meu perfil</label>}
    {enrolled && workspace.settings.voiceIdentityRequired && <>
      <label>Sensibilidade do reconhecimento: {workspace.settings.speakerThreshold.toFixed(2)}
        <input aria-label="Sensibilidade do reconhecimento de voz" type="range" min="0.5" max="0.95" step="0.05" value={workspace.settings.speakerThreshold} onChange={(event) => workspace.setSettings({ speakerThreshold: Number(event.target.value) })} />
      </label>
      <p>Se sua voz for recusada, diminua um pouco a sensibilidade. Pressione Espaço para ativar manualmente sem a verificação de voz para um pedido.</p>
    </>}
  </>
}
