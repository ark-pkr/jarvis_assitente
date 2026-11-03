import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../workspace'
import { useStore, type Phase } from '../store'
import { BRIDGE_HTTP_URL } from '../config'
import { openResearchLink, sanitisePanelHtml } from './sanitise'
import { interfaceCue } from '../lib/uiSounds'
import './mission-control.css'

type Root = { id: string; name: string; path: string }
type Activity = { id: string; title: string; status: string; notes: string }
type Draft = { code: string; filename: string; rootId: string; notes: string }
const openSettings = (tab: string) => window.dispatchEvent(new CustomEvent('jarvis:settings', { detail: tab }))
const modes = [{ id: 'assistente', label: 'Assistente', index: '01', description: 'Conversa · arquivos · rotinas' }, { id: 'tutor', label: 'Professor', index: '02', description: 'Aprender · praticar · evoluir' }, { id: 'desenvolvimento', label: 'Desenvolvedor', index: '03', description: 'Código · revisão · projetos' }] as const
const phaseLine: Record<Phase, string> = { offline: 'AGUARDANDO INÍCIO', boot: 'INICIANDO', dormant: 'EM ESPERA', waking: 'ESCUTA ATIVA', listening: 'ESCUTA ATIVA', thinking: 'PROCESSANDO', tooling: 'CONSULTANDO FERRAMENTAS', speaking: 'RESPONDENDO' }
function initialDraft(): Draft { try { return { code: '', filename: 'exemplo.py', rootId: '', notes: '', ...JSON.parse(localStorage.getItem('jarvis.studio.v1') || '{}') } } catch { return { code: '', filename: 'exemplo.py', rootId: '', notes: '' } } }
function PanelMaterial() {
  const panels = useStore((s) => s.panels)
  const blades = useStore((s) => s.blades)
  const material = [...panels, ...blades.filter((blade) => blade.kind === 'markup' && blade.html)].slice(-3)
  return <>{material.map((item) => <article className="studio-material" key={item.id}><h4>{item.title}</h4><div onClick={openResearchLink} dangerouslySetInnerHTML={{ __html: sanitisePanelHtml(item.html || '') }} /></article>)}</>
}
function MicSpectrum() {
  const level = useStore((s) => s.level)
  const phase = useStore((s) => s.phase)
  const active = ['listening', 'speaking'].includes(phase)
  return <div className="mission-spectrum" aria-label="Nível do microfone"><div>{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ height: `${active ? Math.max(3, (0.3 + Math.sin(i * 1.7) ** 2) * level * 85) : 3}%` }} />)}</div><span>{Math.round(level * 100)}% <small>ENTRADA DE ÁUDIO</small></span></div>
}
function ClockCard() {
  const [clock, setClock] = useState(new Date())
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setClock(new Date()) }, 1000); return () => clearInterval(timer) }, [])
  return <section className="tech-card time-card"><header><span>HORÁRIO DE BRASÍLIA</span><i /></header><time>{clock.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}<small>{clock.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', second: '2-digit' }).slice(-2)}</small></time><p>{clock.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })}</p></section>
}
export function MissionControl({ send }: { send: (prompt: string) => void }) {
  const workspace = useWorkspace()
  const { learning, settings } = workspace
  const turns = useStore((s) => s.turns)
  const phase = useStore((s) => s.phase)
  const connected = useStore((s) => s.connected)
  const activeTool = useStore((s) => s.activeTool)
  const [roots, setRoots] = useState<Root[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [service, setService] = useState(false)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [draftError, setDraftError] = useState('')
  const mode = settings.mode === 'analise' ? 'desenvolvimento' : settings.mode
  const selectedMode = modes.find((item) => item.id === mode) || modes[0]
  const lastReply = [...turns].reverse().find((turn) => turn.role === 'jarvis' && turn.text)?.text
  const lastQuestion = [...turns].reverse().find((turn) => turn.role === 'user')?.text
  const pdfRoot = roots.find((root) => root.path.replaceAll('\\', '/').toLowerCase().replace(/\/$/, '') === learning.pdfFolder.replaceAll('\\', '/').toLowerCase().replace(/\/$/, ''))
  const pdfUrl = pdfRoot && learning.pdfFile ? `${BRIDGE_HTTP_URL}/lesson-pdf?rootId=${encodeURIComponent(pdfRoot.id)}&file=${encodeURIComponent(learning.pdfFile)}#page=${learning.pageFrom}` : ''
  useEffect(() => {
    document.documentElement.dataset.workspaceMode = mode
    return () => { delete document.documentElement.dataset.workspaceMode }
  }, [mode])
  useEffect(() => {
    let live = true
    const refresh = async () => {
      try { const response = await fetch(`${BRIDGE_HTTP_URL}/studio`); if (!response.ok) throw new Error(); const state = await response.json(); if (live) { setRoots(state.roots || []); setActivities(state.activities || []); setService(true) } }
      catch { if (live) setService(false) }
    }
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    window.addEventListener('focus', refresh)
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    const persist = () => { try { if (settings.remember) localStorage.setItem('jarvis.studio.v1', JSON.stringify(draft)); else localStorage.removeItem('jarvis.studio.v1'); setDraftError('') } catch { setDraftError('Não foi possível salvar o rascunho neste dispositivo.') } }
    const timer = setTimeout(persist, 350); window.addEventListener('pagehide', persist)
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', persist) }
  }, [draft, settings.remember])
  const update = (values: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...values }))
  const lessonPrompt = useMemo(() => `Modo professor. ${learning.pdfFile ? `Material: ${JSON.stringify(learning.pdfFile)}, pasta ${JSON.stringify(learning.pdfFolder)}, páginas ${learning.pageFrom} a ${learning.pageTo}. Use project_open se necessário e lesson_pdf_read antes de explicar; peça includeImages=true para tabelas, fórmulas, diagramas, colunas ou extração confusa.` : 'Ainda não escolhi um PDF; ensine o tema de estudo configurado ou pergunte o assunto.'} Nível: ${learning.level}. Objetivo: ${learning.goal || 'aprender programação e análise de sistemas'}. Explique um conceito por vez, cite a página junto de cada ideia da fonte, diferencie fonte de exemplos criados, e admita texto ou diagramas ilegíveis em vez de adivinhar. Em código, mostre um exemplo comentado quando útil, resultado esperado e explicação passo a passo. Em tabelas, explique cabeçalhos, unidades, linhas relevantes e relações. Use painéis legíveis e ofereça exercício opcional ao final; se aceito, dê só uma pista por vez e espere a tentativa.`, [learning])
  return <div className="mission-control" data-mode={mode} data-has-conversation={turns.length > 0} data-side-panels={settings.sidePanelsVisible}>
    <nav className="mode-switch" aria-label="Modos do JARVIS">{modes.map((item) => <button key={item.id} aria-pressed={mode === item.id} onClick={() => { interfaceCue('mode'); workspace.setSettings({ mode: item.id, lightVisuals: true }) }}><span>{item.index}</span><div><b>{item.label}</b><small>{item.description}</small></div></button>)}</nav>
    <div className="mission-kicker"><span>JARVIS / AMBIENTE PESSOAL</span><span>{selectedMode.label.toUpperCase()}</span><span className="mission-live">● {service ? 'SERVIÇO CONECTADO' : 'CONECTANDO AO SERVIÇO'}</span></div>
    {mode === 'assistente' ? <div className="assistant-deck">
      <aside className="mission-column mission-left">
        <section className="tech-card"><header><span>01 / CONEXÕES</span><i /></header><h3>Todos os sistemas,<br/><em>ao seu alcance.</em></h3><p>{connected.length ? `${connected.length} integrações disponíveis nesta sessão.` : 'As integrações aparecem ao conectar o assistente.'}</p><div className="connection-grid">{['Conversa', 'Arquivos', 'Word', 'VS Code'].map((name) => <span key={name}><i />{name}</span>)}</div><button onClick={() => openSettings('Conexões')}>Ver conexões ↗</button></section>
        <section className="tech-card"><header><span>02 / ATALHOS</span><i /></header><div className="deck-actions"><button onClick={() => openSettings('Computador')}>↗ Aplicativos</button><button onClick={() => openSettings('Arquivos')}>▤ Meus arquivos</button><button onClick={() => openSettings('Central')}>◷ Rotinas e tarefas</button><button onClick={() => { openSettings('Central'); send(`Comece meu dia: consulte local_time e assistant_overview para me dizer compromissos, tarefas e lembretes de hoje. ${workspace.settings.newsTopics.trim() ? `Pesquise notícias atuais sobre estes assuntos: ${JSON.stringify(workspace.settings.newsTopics)}. Compare fontes e mostre links citáveis em um painel.` : 'Não pesquise notícias sem assuntos configurados; pergunte se quero definir temas para o briefing diário.'} Seja breve e não crie nem altere registros.`) }}>☼ Começar meu dia</button><button onClick={() => send('Consulte assistant_overview e diga onde parei nos meus projetos e estudos, com o próximo passo. Não invente progresso.')}>↳ Onde eu parei?</button></div></section>
      </aside>
      <div className="reactor-caption"><span>INTERFACE DE INTELIGÊNCIA PESSOAL</span><h1>J.A.R.V.I.S.</h1><p>Uma conversa. Infinitas possibilidades.</p><div className="reactor-coordinate" data-phase={phase}>{phaseLine[phase]}</div></div>
      <aside className="mission-column mission-right">
        <ClockCard />
        <section className="tech-card"><header><span>CAPTURA DE VOZ</span><i /></header><MicSpectrum/><p>{phase === 'listening' ? 'Diga “Jarvis” e faça seu pedido.' : phase === 'speaking' ? 'Respondendo. Espaço para interromper.' : phase === 'offline' ? 'Inicie o JARVIS para ativar o microfone.' : activeTool ? 'Consultando uma ferramenta.' : 'O estado da conversa aparece no topo.'}</p><button onClick={() => openSettings('Áudio')}>Ajustar microfone ↗</button></section>
        <section className="tech-card"><header><span>ÚLTIMA ATIVIDADE</span><i /></header><p className="activity-title">{activities[0]?.title || 'Seu próximo pedido começa uma nova atividade.'}</p><span className="state-chip">{activities[0]?.status || 'SEM ATIVIDADE REGISTRADA'}</span></section>
      </aside>
    </div> : <main className="studio-deck" aria-label={mode === 'tutor' ? 'Área do Professor' : 'Área do Desenvolvedor'}>
      <header className="studio-heading"><div><span>{mode === 'tutor' ? 'APRENDIZADO COM DIREÇÃO' : 'DO RACIOCÍNIO À IMPLEMENTAÇÃO'}</span><h1>{mode === 'tutor' ? 'Seu espaço de aprender.' : 'Vamos construir algo.'}</h1><p>{mode === 'tutor' ? 'Material, explicação e prática no mesmo lugar.' : 'Código, revisão e contexto para o seu próximo passo.'}</p></div><button onClick={() => openSettings(mode === 'tutor' ? 'Aprender' : 'Arquivos')}>{mode === 'tutor' ? 'Escolher material ↗' : 'Conectar projeto ↗'}</button></header>
      {mode === 'tutor' ? <div className="professor-grid">
        <section className="studio-card material-card"><header><span>01 / MATERIAL E EXPLICAÇÃO</span><small>{learning.level}</small></header>{pdfUrl ? <iframe title="PDF da aula" src={pdfUrl} /> : <div className="lesson-explanation">{lastReply ? <><span className="document-symbol">▤</span><h2>{learning.pdfTopic || 'Explicação da aula'}</h2><p>{lastReply}</p></> : <div className="studio-empty"><span>▤</span><h2>O conhecimento<br/>ganha espaço aqui.</h2><p>Escolha um PDF ou diga qual assunto você quer aprender. A explicação fica nesta coluna.</p><button onClick={() => openSettings('Aprender')}>Preparar minha aula</button></div>}</div>}<footer>{learning.pdfFile || 'Nenhum PDF selecionado'}{learning.pdfFile && ` · páginas ${learning.pageFrom}–${learning.pageTo}`}</footer></section>
        <section className="studio-card practice-card"><header><span>02 / EXEMPLOS E PRÁTICA</span><small>PASSO A PASSO</small></header><div className="practice-content"><PanelMaterial/>{lastReply ? <><h3>Relacionando com a prática</h3><p className="studio-prose">{lastReply}</p></> : <div className="practice-intro"><span className="code-symbol">{'</>'}</span><h2>Entender.<br/>Experimentar.<br/><em>Aprender.</em></h2><p>Os exemplos da conversa aparecem aqui, sem esconder o material da aula.</p></div>}<div className="studio-actions"><button onClick={() => send(lessonPrompt + ' Explique um conceito, com um exemplo concreto, diretamente em português.')}>Explicar com exemplo</button><button onClick={() => send(lessonPrompt + ' Proponha um exercício adequado ao meu nível e dê pistas sem revelar a solução. Espere minha tentativa.')}>Quero praticar</button><button onClick={() => send('Retome a aula usando assistant_overview e lesson_recent quando disponíveis. Revise minha última dúvida e proponha o próximo passo sem inventar progresso.')}>Retomar a aula</button></div><label>Minhas anotações<textarea aria-label="Anotações da aula" value={draft.notes} maxLength={12000} onChange={(event) => update({ notes: event.target.value })} placeholder="Anote o que fez sentido, suas dúvidas e o que quer praticar." /></label></div></section>
      </div> : <div className="developer-grid">
        <section className="studio-card code-card"><header><span>01 / CÓDIGO</span><small>RASCUNHO LOCAL</small></header><div className="code-toolbar"><input aria-label="Nome do arquivo de código" value={draft.filename} maxLength={250} onChange={(event) => update({ filename: event.target.value })}/><select aria-label="Projeto do desenvolvedor" value={draft.rootId} onChange={(event) => update({ rootId: event.target.value })}><option value="">Escolher pasta autorizada</option>{roots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}</select></div><div className="editor-surface"><div aria-hidden="true" className="line-numbers">{Array.from({ length: Math.max(12, draft.code.split('\n').length) }, (_, i) => <span key={i}>{i + 1}</span>)}</div><textarea aria-label="Rascunho de código" spellCheck={false} value={draft.code} maxLength={16000} onChange={(event) => update({ code: event.target.value })} placeholder={'# Seu próximo projeto começa aqui.\n# Cole um trecho para explicar ou revisar.\n# O rascunho não executa nem altera seus arquivos.'}/></div><div className="studio-actions"><button disabled={!draft.code.trim()} onClick={() => send(`Explique este código linha por linha e mostre exemplos em um painel: arquivo ${JSON.stringify(draft.filename)}\n${draft.code}\nNão execute nem altere arquivos.`)}>Explicar código</button><button onClick={() => send('Use editor_selection para ler a seleção compartilhada do VS Code. Explique e mostre o trecho em um painel de código. Se não houver seleção, ensine o comando JARVIS: Compartilhar seleção.')}>Ler do VS Code ↗</button></div></section>
        <section className="studio-card review-card"><header><span>02 / ALTERAÇÕES PROPOSTAS</span><small>REVISÃO</small></header><div className="review-content"><PanelMaterial/>{lastReply ? <p className="studio-prose">{lastReply}</p> : <div className="studio-empty"><span>±</span><h2>Uma mudança.<br/>Um motivo claro.</h2><p>Peça uma revisão. O JARVIS deve mostrar o problema, a proposta e o que precisa ser validado.</p></div>}</div><div className="studio-actions"><button disabled={!draft.code.trim()} onClick={() => send(`Revise este código e mostre as alterações propostas em painel, com antes/depois e testes sugeridos. Arquivo: ${JSON.stringify(draft.filename)}\n${draft.code}\nNão afirme execução e não altere arquivos ainda.`)}>Revisar rascunho</button><button disabled={!draft.rootId || !draft.code.trim() || !draft.filename.trim()} onClick={() => send(`Quero gravar o código abaixo na pasta autorizada rootId ${JSON.stringify(draft.rootId)}, arquivo relativo ${JSON.stringify(draft.filename)}. Leia a versão existente e use project_write, mostrando antes/depois e pedindo confirmação. Depois abra no VS Code via desktop_open. Não execute código.\n${draft.code}`)}>Aplicar no projeto</button></div></section>
        <section className="studio-card results-card"><header><span>03 / RESULTADOS E ATIVIDADE</span><small>VERIFICÁVEL</small></header><div className="result-summary"><span className="terminal-mark">{'>_'}</span><h3>{activeTool ? 'Ferramenta em andamento' : 'Sem execução de código verificada'}</h3><p>{activeTool ? 'Aguarde o retorno da operação.' : 'Escrever ou revisar um código não significa que ele foi executado. Os retornos das ferramentas e os pedidos registrados aparecem abaixo.'}</p></div><div className="result-activities">{activities.slice(0, 4).map((activity) => <article key={activity.id}><span className="state-chip">{activity.status}</span><p>{activity.title}</p><small>{activity.notes}</small></article>)}{!activities.length && <p>Nenhuma atividade registrada neste serviço.</p>}</div><button onClick={() => openSettings('Central')}>Abrir central de tarefas ↗</button></section>
      </div>}
      {draftError && <p role="alert">{draftError}</p>}
      <footer className="studio-context"><span>CONTEXTO ATUAL</span><p>{lastQuestion || 'Faça seu pedido por voz. O contexto da conversa acompanha os próximos passos.'}</p></footer>
    </main>}
    <div className="mission-footer"><span>JARVIS OS <b>{__JARVIS_VERSION__}</b></span><span>{settings.mode === 'tutor' ? 'CONHECIMENTO EM MOVIMENTO' : mode === 'desenvolvimento' ? 'IDEIAS EM CONSTRUÇÃO' : 'SISTEMA PESSOAL DE ASSISTÊNCIA'}</span><div className="mission-footer-actions"><button aria-pressed={settings.sidePanelsVisible} onClick={() => workspace.setSettings({ sidePanelsVisible: !settings.sidePanelsVisible })}>{settings.sidePanelsVisible ? 'Ocultar painéis' : 'Mostrar painéis'}</button><button onClick={() => openSettings('Histórico')}>Histórico e ajustes ↗</button></div></div>
  </div>
}
