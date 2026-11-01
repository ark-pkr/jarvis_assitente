import { useState } from 'react'
import { useStore, type Phase } from '../store'
import { ConnectionStatus } from './ConnectionStatus'

const messages: Record<Phase, string> = {
  offline: 'Inicie o JARVIS para conversar.', boot: 'Preparando microfone e voz…',
  dormant: 'Diga “Oi Jarvis” ou clique em Falar.', waking: 'Pode falar. Estou ouvindo.',
  listening: 'Ouvindo… faça sua pergunta.', thinking: 'Entendi. Preparando sua resposta…',
  tooling: 'Consultando as ferramentas…', speaking: 'Respondendo. Você pode me interromper.',
}

export type VoiceActions = {
  onTalk: () => void
  onStop: () => void
  onTestAudio: () => void
  onSend: (text: string) => void
}

export function VoiceControls({ onTalk, onStop, onTestAudio, onSend }: VoiceActions) {
  const phase = useStore((s) => s.phase)
  const caption = useStore((s) => s.caption)
  const turns = useStore((s) => s.turns)
  const [draft, setDraft] = useState('')
  const ready = phase !== 'offline' && phase !== 'boot'
  const listening = phase === 'listening' || phase === 'waking'
  const busy = ['thinking', 'tooling', 'speaking'].includes(phase)
  const last = [...turns].reverse().find((turn) => turn.role === 'user')?.text

  return (
    <section className={`voice-console${listening ? ' is-listening' : ''}`} aria-label="Controles de conversa">
      <div className="voice-status" role="status" aria-live="polite">
        <span className={`voice-indicator${busy ? ' is-busy' : ''}`} aria-hidden="true" />
        {messages[phase]}
      </div>
      <ConnectionStatus />
      <div className="voice-heard">
        <span>{caption && listening ? 'Estou ouvindo' : 'Último pedido'}</span>
        <p>{caption && listening ? caption : last || 'Sua fala reconhecida aparecerá aqui.'}</p>
      </div>
      <div className="voice-actions">
        <button className="voice-talk" disabled={phase === 'boot'} onClick={onTalk}>
          <span aria-hidden="true">●</span> {phase === 'offline' ? 'Iniciar conversa' : busy ? 'Interromper e falar' : 'Falar'}
        </button>
        <button onClick={onStop} disabled={!ready || phase === 'dormant'}>Parar</button>
        <button onClick={onTestAudio} disabled={!ready}>Testar som</button>
      </div>
      <form className="voice-text-form" onSubmit={(event) => {
        event.preventDefault()
        if (!ready || !draft.trim()) return
        onSend(draft.trim())
        setDraft('')
      }}>
        <input aria-label="Digite seu pedido" placeholder="Prefere digitar? Escreva seu pedido…" value={draft}
          maxLength={4000} disabled={!ready} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!ready || !draft.trim()}>Enviar</button>
      </form>
    </section>
  )
}
