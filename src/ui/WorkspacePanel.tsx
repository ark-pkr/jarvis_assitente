import { useEffect, useRef, useState } from 'react'
import { useWorkspace, flushWorkspace } from '../workspace'
import { useStore } from '../store'
import { watchApproval, type Approval } from '../lib/bridge'
import { ConnectionStatus } from './ConnectionStatus'
import { LearnedPanel } from './LearnedPanel'
import { LearningPanel, FilesPanel, ComputerPanel } from './LearningPanel'
import { AudioCheck } from './AudioCheck'
import { AssistantPanel, AssistantAlerts } from './AssistantPanel'
import { DesktopSettings } from './DesktopSettings'
import { MicrophoneSettings } from './MicrophoneSettings'
import { VoiceIdentitySettings } from './VoiceIdentitySettings'
import { BackupPanel } from './BackupPanel'
import { DiagnosticButton } from './DiagnosticButton'
import { automaticBackup } from '../lib/backup'
import { setCinema } from '../lib/cinema'
import { interfaceCue, watchInterfaceSounds } from '../lib/uiSounds'

/** Longer than any click, and short enough not to annoy anyone who means it. */
const HOLD_TO_APPROVE_MS = 800
/** Long enough for the opening to finish before a file gets written. */
const BACKUP_AFTER_MS = 30000

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
  // The window jumps to the front to ask, and a click meant for whatever was there
  // must not land on Authorize.
  const [armed, setArmed] = useState(false)
  // The card comes up over whatever the person was doing, so a click on its way to
  // another program can land here at any moment. A click alone never authorizes.
  const [holding, setHolding] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const letGo = () => { clearTimeout(holdTimer.current); setHolding(false) }
  useEffect(() => watchApproval((next) => {
    setApproval(next)
    // A question nobody can see is a turn that hangs until it times out.
    if (next) void window.jarvisDesktop?.requestAttention()
    else void window.jarvisDesktop?.releaseAttention()
  }), [])
  useEffect(() => { const show = (event: Event) => { setTab((event as CustomEvent<string>).detail || 'Histórico'); setOpen(true) }; window.addEventListener('jarvis:settings', show); return () => window.removeEventListener('jarvis:settings', show) }, [])
  useEffect(() => {
    if (!approval) return
    approveButton.current?.focus()
    setArmed(false)
    const timer = setTimeout(() => setArmed(true), 1200)
    return () => { clearTimeout(timer); clearTimeout(holdTimer.current); setHolding(false) }
  }, [approval])
  useEffect(() => { setMemory(workspace.memory) }, [workspace.memory])
  useEffect(() => { const timer = setTimeout(automaticBackup, BACKUP_AFTER_MS); return () => clearTimeout(timer) }, [])
  useEffect(watchInterfaceSounds, [])
  const wasOpen = useRef(false)
  useEffect(() => { if (open !== wasOpen.current) interfaceCue(open ? 'open' : 'close'); wasOpen.current = open }, [open])
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
        <LearnedPanel />
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
        <BackupPanel onBeforeRestore={stop} />
      </>}
      {tab === 'Áudio' && <>
        <MicrophoneSettings />
        <VoiceIdentitySettings onPauseVoice={onPauseVoice} onResumeVoice={onResumeVoice} />
        <h3>Personalidade</h3>
        <label>Como ele fala
          <select aria-label="Personalidade" value={workspace.settings.personality} onChange={(event) => workspace.setSettings({ personality: event.target.value as typeof workspace.settings.personality })}>
            <option value="formal">Formal · sóbrio, sem piadas</option><option value="equilibrado">Equilibrado · direto e cordial</option><option value="bem-humorado">Bem-humorado · leve</option><option value="sarcastico">Sarcástico · mordomo inglês</option>
          </select></label>
        <p>Vale a partir da próxima resposta. Você também pode pedir por voz. O humor nunca aparece em erros, confirmações ou más notícias.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.followUp} onChange={(event) => workspace.setSettings({ followUp: event.target.checked })} />Depois de responder, ouvir o próximo pedido sem precisar dizer “Jarvis”</label>
        <p>Desligado, ele só atende quando ouve o nome: conversas no ambiente, como um atendimento no balcão, não viram pedidos. Ligado, por 15 segundos depois de cada resposta, qualquer fala é tratada como pedido.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.bargeIn} onChange={(event) => workspace.setSettings({ bargeIn: event.target.checked })} />Interromper só falando, sem dizer o nome</label>
        <p>Use com fone. Em caixa de som, a própria voz dele pode se interromper. Nada sai do computador até ele parar de falar e passar a ouvir você.</p>
        <h3>Voz e desempenho</h3>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.greeting} onChange={(event) => workspace.setSettings({ greeting: event.target.checked })} />Cumprimentar ao iniciar, com lembretes, tarefas e próximo passo</label>
        <p>O resumo completo é falado uma vez por dia; nas outras aberturas, só o cumprimento. Com a voz neural, esse texto passa pela API Gemini. Se houver cidade na Central, inclui o clima, que vem do Open-Meteo.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.fullBoot} onChange={(event) => workspace.setSettings({ fullBoot: event.target.checked })} />Reproduzir sempre a abertura completa</label>
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
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.holoCore} onChange={(event) => workspace.setSettings({ holoCore: event.target.checked })} />Buraco negro pela placa de vídeo</label>
        <p>A nitidez se ajusta sozinha ao seu computador. Desmarque para voltar à esfera simples.</p>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.liveCamera} onChange={(event) => workspace.setSettings({ liveCamera: event.target.checked })} />Câmera viva: o buraco negro acompanha o mouse</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.reactiveStars} onChange={(event) => workspace.setSettings({ reactiveStars: event.target.checked })} />Estrelas que reagem à voz</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.orbitingPlanets} onChange={(event) => workspace.setSettings({ orbitingPlanets: event.target.checked })} />Planetas em órbita que reagem à voz</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.dayCycle} onChange={(event) => workspace.setSettings({ dayCycle: event.target.checked })} />Buraco negro acompanha a hora do dia (mais calmo à noite)</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.holoIntro} onChange={(event) => workspace.setSettings({ holoIntro: event.target.checked })} />Abertura com voo até o buraco negro ao abrir</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.aurora} onChange={(event) => workspace.setSettings({ aurora: event.target.checked })} />Aurora no céu de fundo</label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.cosmicEvents} onChange={(event) => workspace.setSettings({ cosmicEvents: event.target.checked })} />Eventos raros: fusão de buracos negros e chuva de meteoros em datas especiais</label>
        <label>Seu aniversário (dia/mês), para a chuva de meteoros
          <input aria-label="Seu aniversário" placeholder="ex.: 15/08" maxLength={5} value={workspace.settings.birthday} onChange={(event) => workspace.setSettings({ birthday: event.target.value.replace(/[^\d/]/g, '') })} /></label>
        <label className="setting-check"><input type="checkbox" checked={workspace.settings.uiSounds} onChange={(event) => workspace.setSettings({ uiSounds: event.target.checked })} />Sons de interface</label>
        <button onClick={() => { setOpen(false); setCinema(true) }}>Modo cinema</button>
        <p>Tela cheia só com o buraco negro e a legenda. Atalho: <b>C</b>. Para sair: <b>C</b> ou <b>Esc</b>. Por voz: “modo cinema”.</p>
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
      {tab === 'Conexões' && <><h3>Estado dos serviços</h3><ConnectionStatus detailed /><p>O Chrome dedicado abre na primeira navegação. Faça login manualmente nessa janela. As ações de clique e preenchimento precisam de confirmação.</p><DiagnosticButton /></>}
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
      <p>Confira o destino e o conteúdo. Diga <b>“sim”</b> para autorizar ou <b>“não”</b> para cancelar, ou segure o botão. O JARVIS só executará esta ação uma vez após sua confirmação.</p>
      <div><button ref={approveButton} onClick={() => approval.decide(false)}>Cancelar</button><button className="hold-to-approve" data-holding={holding} aria-label="Autorizar esta ação" disabled={!armed}
        onPointerDown={() => { setHolding(true); holdTimer.current = setTimeout(() => approval.decide(true), HOLD_TO_APPROVE_MS) }}
        onPointerUp={letGo} onPointerLeave={letGo} onPointerCancel={letGo}
        // Detail 0 is the keyboard, which had to Tab here on purpose: focus starts on Cancel.
        onClick={(event) => { if (event.detail === 0) approval.decide(true) }}>{holding ? 'Continue segurando…' : 'Segure para autorizar'}</button></div>
    </section></div>}
  </>
}
