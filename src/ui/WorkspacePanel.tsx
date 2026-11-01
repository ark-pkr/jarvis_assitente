import { useEffect, useRef, useState } from 'react'
import { useWorkspace, flushWorkspace } from '../workspace'
import { useStore } from '../store'
import { watchApproval, type Approval } from '../lib/bridge'
import { ConnectionStatus } from './ConnectionStatus'
import { LearningPanel, FilesPanel, ComputerPanel } from './LearningPanel'
import { AudioCheck } from './AudioCheck'
import { AssistantPanel, AssistantAlerts } from './AssistantPanel'
import { DesktopSettings } from './DesktopSettings'
import { MicrophoneSettings } from './MicrophoneSettings'
import { VoiceIdentitySettings } from './VoiceIdentitySettings'

export function WorkspacePanel({ onStop, onPauseVoice, onResumeVoice, onRepeat, onTestVoice }: { onStop: () => void; onPauseVoice: () => void; onResumeVoice: () => void; onRepeat: (text: string) => void; onTestVoice: () => void }) {
  const workspace = useWorkspace()
  const phase = useStore((s) => s.phase)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('Histórico')
  const [query, setQuery] = useState('')
  const [approval, setApproval] = useState<Approval | null>(null)
  const [memory, setMemory] = useState(workspace.memory)
  const [savedNote, setSavedNote] = useState('')
  const approveButton = useRef<HTMLButtonElement>(null)
  useEffect(() => watchApproval(setApproval), [])
  useEffect(() => { const show = (event: Event) => { setTab((event as CustomEvent<string>).detail || 'Histórico'); setOpen(true) }; window.addEventListener('jarvis:settings', show); return () => window.removeEventListener('jarvis:settings', show) }, [])
  useEffect(() => { if (approval) approveButton.current?.focus() }, [approval])
  useEffect(() => { setMemory(workspace.memory) }, [workspace.memory])
  const active = workspace.sessions.find((session) => session.id === workspace.active)
  const ready = phase !== 'offline' && phase !== 'boot'
  const stop = () => { onStop(); flushWorkspace() }
  const exportHistory = () => {
    const file = new Blob([JSON.stringify({ sessions: workspace.sessions, memory: workspace.memory }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a'); link.href = url; link.download = 'jarvis-historico.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <AssistantAlerts />
    {(ready || window.jarvisDesktop) && <button className="workspace-open" onClick={() => setOpen(true)}>Histórico e ajustes</button>}
    {open && <aside className="workspace-panel" aria-label="Histórico e ajustes">
      <header><h2>Seu JARVIS</h2><button onClick={() => setOpen(false)} aria-label="Fechar ajustes">Fechar ✕</button></header>
      <nav aria-label="Seções">{['Histórico', 'Central', 'Aprender', 'Arquivos', 'Computador', 'Memória', 'Áudio', 'Conexões', ...(window.jarvisDesktop ? ['Aplicativo'] : [])].map((name) =>
        <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
      {workspace.storageError && <p role="alert">{workspace.storageError}</p>}
      {tab === 'Aplicativo' && <DesktopSettings />}
      {tab === 'Central' && <AssistantPanel send={(prompt) => { setOpen(false); onRepeat(prompt) }} />}
      {tab === 'Aprender' && <LearningPanel send={(prompt) => { setOpen(false); onRepeat(prompt) }} />}
      {tab === 'Arquivos' && <FilesPanel send={(prompt) => { setOpen(false); onRepeat(prompt) }} />}
      {tab === 'Computador' && <ComputerPanel send={(prompt) => { setOpen(false); onRepeat(prompt) }} />}
      {tab === 'Histórico' && <>
        <div className="workspace-row"><button onClick={() => { stop(); workspace.newSession() }}>Nova conversa</button>
          <button onClick={exportHistory}>Exportar histórico</button></div>
        <input aria-label="Buscar no histórico" placeholder="Buscar conversas ou mensagens…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="session-list">{workspace.sessions.filter((session) =>
          `${session.title} ${session.turns.map((turn) => turn.text).join(' ')}`.toLowerCase().includes(query.toLowerCase())
        ).map((session) => <div key={session.id} className={session.id === workspace.active ? 'selected' : ''}>
          <button onClick={() => { stop(); workspace.select(session.id) }}><b>{session.title}</b>
            <small>{new Date(session.updated).toLocaleString('pt-BR')} · {session.turns.length} mensagens</small></button>
          <button aria-label={`Excluir ${session.title}`} onClick={() => {
            if (window.confirm('Excluir esta conversa deste navegador?')) { stop(); workspace.remove(session.id) }
          }}>Excluir</button>
        </div>)}</div>
        <h3>{active?.title}</h3>
        <div className="history-messages">{active?.turns.map((turn) => <article key={turn.id}>
          <b>{turn.role === 'user' ? 'Você' : 'JARVIS'}</b><p>{turn.text}</p>
          {turn.role === 'user' && <button onClick={() => { setOpen(false); onRepeat(turn.text) }}>Repetir pedido</button>}
        </article>)}</div>
      </>}
      {tab === 'Memória' && <>
        <h3>Preferências que o JARVIS deve lembrar</h3>
        <p>Escreva como prefere ser atendido. Estas notas e as últimas 40 mensagens da conversa selecionada acompanham seus pedidos ao Gemini.</p>
        <textarea aria-label="Preferências e memória" rows={8} maxLength={6000} value={memory} onChange={(event) => { setMemory(event.target.value); setSavedNote('') }} placeholder="Ex.: Prefiro respostas curtas. Trabalho com manutenção elétrica." />
        <button onClick={() => { workspace.setMemory(memory); setSavedNote('Preferências salvas.') }}>Salvar memória</button>
        <p role="status">{savedNote}</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.remember} onChange={(event) => workspace.setSettings({ remember: event.target.checked })} />Guardar histórico e memória neste navegador</label>
        <p>Os dados ficam neste perfil do navegador. Desativar o salvamento mantém a conversa atual somente até fechar a página.</p>
        <button className="danger" onClick={() => {
          if (window.confirm('Apagar todas as conversas e a memória salvas neste navegador?')) { stop(); workspace.clear(); setMemory('') }
        }}>Apagar histórico e memória</button>
      </>}
      {tab === 'Áudio' && <>
        <MicrophoneSettings />
        <VoiceIdentitySettings onPauseVoice={onPauseVoice} onResumeVoice={onResumeVoice} />
        <h3>Voz e desempenho</h3>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.naturalVoice} onChange={(event) => workspace.setSettings({ naturalVoice: event.target.checked })} />Voz neural natural do Gemini</label>
        <p>Usa a API Gemini para gerar áudio em português, com ritmo mais ágil e pausas curtas. Consome a cota de áudio da API e pode adicionar alguns segundos de espera. Se falhar, usa a voz do navegador.</p>
        <label>Voz neural<select aria-label="Voz neural" value={workspace.settings.neuralVoice} onChange={(event) => workspace.setSettings({ neuralVoice: event.target.value })}>
          <option value="Charon">Charon · suave e informativa</option><option value="Orus">Orus · firme</option><option value="Kore">Kore · clara e firme</option><option value="Puck">Puck · descontraída</option>
        </select></label>
        <label>Visual holográfico
          <select aria-label="Visual holográfico" value={workspace.settings.visualTheme} onChange={(event) => workspace.setSettings({ visualTheme: event.target.value === 'helios' ? 'helios' : event.target.value === 'reactor' ? 'reactor' : 'sphere' })}>
            <option value="sphere">Esfera neural dourada</option><option value="reactor">Reator circular</option><option value="helios">Reator HELIOS cinematográfico</option>
          </select>
        </label>
        <p>A esfera neural e o reator circular usam os visuais leves. O HELIOS abre o reator cinematográfico integrado à conversa e aos comandos de voz, sem pedir acesso adicional ao microfone.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.helios.introOnStartup} onChange={(event) => workspace.setSettings({ helios: { introOnStartup: event.target.checked } })} />Reproduzir abertura cinematográfica ao iniciar o HELIOS</label>
        <label>Qualidade do HELIOS
          <select aria-label="Qualidade do HELIOS" value={workspace.settings.helios.quality} onChange={(event) => workspace.setSettings({ helios: { quality: event.target.value as typeof workspace.settings.helios.quality } })}>
            <option value="auto">Automática · recomendada</option><option value="eco">Econômica</option><option value="balanced">Equilibrada</option><option value="ultra">Ultra</option>
          </select>
        </label>
        <p>O modo automático reduz partículas em computadores com poucos núcleos ou pouca memória. Os controles de cor, brilho, velocidade, pausa e camadas ficam no painel HELIOS.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.lightVisuals} onChange={(event) => workspace.setSettings({ lightVisuals: event.target.checked })} />Modo visual leve (recomendado)</label>
        <p>Desative apenas se quiser usar os efeitos 3D completos.</p>
        <label>Música de fundo: {Math.round(workspace.settings.music * 100)}%
          <input aria-label="Volume da música" type="range" min="0" max="1" step="0.05" value={workspace.settings.music} onChange={(event) => workspace.setSettings({ music: Number(event.target.value) })} /></label>
        <label>Volume da voz: {Math.round(workspace.settings.voiceVolume * 100)}%
          <input aria-label="Volume da voz" type="range" min="0" max="1" step="0.05" value={workspace.settings.voiceVolume} onChange={(event) => workspace.setSettings({ voiceVolume: Number(event.target.value) })} /></label>
        <label>Velocidade da voz: {workspace.settings.voiceRate.toFixed(1)}×
          <input aria-label="Velocidade da voz" type="range" min="0.7" max="1.8" step="0.1" value={workspace.settings.voiceRate} onChange={(event) => workspace.setSettings({ voiceRate: Number(event.target.value) })} /></label>
        <p>Use 1,3× para falar mais rápido; até 1,8×. Volume e velocidade são aplicados à próxima fala.</p>
        <AudioCheck onTestVoice={onTestVoice} />
        <label>Silêncio antes de enviar a fala: {workspace.settings.speechPause.toFixed(1)} s
          <input aria-label="Pausa da captura de voz" type="range" min="0.6" max="2.5" step="0.1" value={workspace.settings.speechPause} onChange={(event) => workspace.setSettings({ speechPause: Number(event.target.value) })} /></label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.fast} onChange={(event) => workspace.setSettings({ fast: event.target.checked })} />Preferir respostas rápidas para perguntas simples</label>
        <p>O JARVIS escolhe mais análise para pesquisas, comparações e pedidos complexos. Você também pode dizer “resposta rápida” ou “investigue melhor”.</p>
      </>}
      {tab === 'Conexões' && <><h3>Estado dos serviços</h3><ConnectionStatus detailed /><p>O Chrome dedicado abre na primeira navegação. Faça login manualmente nessa janela. As ações de clique e preenchimento precisam de confirmação.</p></>}
    </aside>}
    {approval && <div className="approval-backdrop" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); approval.decide(false) }
      if (event.key === 'Tab') {
        event.preventDefault()
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
        const index = [...buttons].indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }}><section className="approval-card" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <h2 id="approval-title">Confirmar ação do JARVIS</h2>
      <p><b>{approval.action}</b></p><p className="approval-details">{approval.details}</p>
      <p className="approval-url">Página: {approval.url}</p>
      <p>Confira o destino e o conteúdo. O JARVIS só executará esta ação uma vez após sua confirmação.</p>
      <div><button ref={approveButton} onClick={() => approval.decide(false)}>Cancelar</button><button onClick={() => approval.decide(true)}>Autorizar esta ação</button></div>
    </section></div>}
  </>
}
