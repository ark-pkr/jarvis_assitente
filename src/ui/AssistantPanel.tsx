import { useEffect, useState } from 'react'
import { BRIDGE_WS_URL } from '../config'
import { useWorkspace } from '../workspace'

const endpoint = BRIDGE_WS_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '').replace(/\/$/, '') + '/assistant'
type Entry = { id: string; kind: string; title: string; notes: string; next: string; context: string; status: string; rootId: string; file: string; due: string; steps: { appId: string; rootId?: string; file?: string }[]; newWord: boolean; minutes: number; updated: number }
type Snapshot = { entries: Entry[]; activities: { id: string; title: string; notes: string; status: string }[]; notifications: { id: string; title: string }[]; roots: { id: string; name: string; path: string }[] }
const empty = () => ({ kind: 'projeto', title: '', notes: '', next: '', context: '', status: 'pendente', rootId: '', file: '', due: '', steps: [] as Entry['steps'], newWord: false, minutes: 0 })
async function request(body?: unknown) {
  const response = await fetch(endpoint, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Não foi possível acessar a central.')
  return result
}
export function AssistantAlerts() {
  const [alerts, setAlerts] = useState<Snapshot['notifications']>([])
  useEffect(() => {
    let live = true
    const refresh = () => { void fetch(endpoint + '/alerts').then((response) => response.ok ? response.json() : Promise.reject()).then((state) => { if (live) setAlerts(state.notifications) }).catch(() => {}) }
    refresh(); const timer = setInterval(refresh, 15000)
    return () => { live = false; clearInterval(timer) }
  }, [])
  return alerts.length > 0 && <aside className="assistant-alerts" aria-label="Lembretes" role="status">{alerts.slice(0, 3).map((alert) => <div key={alert.id}><b>Lembrete: {alert.title}</b><button onClick={() => { void request({ action: 'ack', id: alert.id }).then(() => setAlerts((items) => items.filter((item) => item.id !== alert.id))).catch(() => {}) }}>Dispensar</button></div>)}</aside>
}
export function AssistantPanel({ send }: { send: (text: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ entries: [], activities: [], notifications: [], roots: [] })
  const [draft, setDraft] = useState<ReturnType<typeof empty> & { id?: string }>(empty)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const workspace = useWorkspace()
  const refresh = async () => { setSnapshot(await request()) }
  useEffect(() => { void refresh().catch((error) => setMessage(error.message)); const timer = setInterval(() => { void refresh().catch(() => {}) }, 10000); return () => clearInterval(timer) }, [])
  const change = (values: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...values }))
  const save = async () => {
    setBusy(true); setMessage('')
    try { await request({ action: 'save', entry: { ...draft, steps: draft.steps.map((step) => ['vscode', 'explorer'].includes(step.appId) ? { appId: step.appId, ...(draft.rootId ? { rootId: draft.rootId, ...(draft.file ? { file: draft.file } : {}) } : {}) } : step) } }); setDraft(empty()); await refresh(); setMessage('Registro salvo no computador.') }
    catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <>
    <h3>Assistente dedicado</h3>
    <p>Perfil, projetos, estudos e tarefas ficam salvos neste computador. Você pode consultar, editar e excluir cada registro.</p>
    <div className="workspace-row">
      <button onClick={() => send(`Comece meu dia. Consulte local_time e assistant_overview para listar compromissos, tarefas e lembretes de hoje. ${workspace.settings.newsTopics.trim() ? `Pesquise notícias atuais sobre estes assuntos: ${JSON.stringify(workspace.settings.newsTopics)}. Compare fontes e mostre links citáveis em um painel.` : 'Não pesquise notícias sem assuntos configurados; pergunte se quero definir temas para o briefing diário.'} Seja breve e não crie nem altere registros.`)}>Começar meu dia</button>
      <button onClick={() => send('Consulte assistant_overview e me diga onde parei nos projetos e estudos, com próximos passos. Não invente progresso nem abra aplicativos ainda.')}>Onde eu parei?</button>
      <button onClick={() => send('Use computer_summary e explique o consumo atual de CPU, memória e espaço em disco. Não encerre processos.')}>Resumo do computador</button>
      <button onClick={() => send('Use editor_selection para explicar o trecho que compartilhei do VS Code, linha por linha, com exemplos. Se não houver seleção válida, ensine a usar o comando JARVIS: Compartilhar seleção no VS Code.')}>Explicar seleção do VS Code</button>
      <button onClick={() => send('Liste project_changes e mostre as últimas alterações. Pergunte qual alteração quero desfazer antes de usar project_undo.')}>Alterações e recuperação</button>
      <button onClick={() => send('Quero iniciar um bloco de foco de 25 minutos. Consulte a hora local e crie um lembrete para o fim do bloco usando assistant_save, com confirmação explícita. Não abra aplicativos. Depois sugira uma pausa de 5 minutos.')}>Foco por 25 minutos</button>
      <button onClick={() => send('Ajude-me a planejar um projeto. Pergunte só o que for essencial, proponha etapas e critérios de conclusão, use project_plan para validar o plano e só salve tarefas com minha confirmação.')}>Planejar um projeto</button>
      <button onClick={() => send('Crie flashcards de estudo. Selecione uma fonte que já autorizei ou pergunte qual assunto/material usar; leia a fonte antes de gerar cartões, cite arquivo e páginas/linhas, e depois aplique revisão ativa: mostre uma pergunta por vez e espere minha resposta antes de revelar a solução.')}>Criar flashcards</button>
      <button onClick={() => send('Quero revisar um texto. Peça o texto se ainda não o enviei; preserve meu estilo, apresente uma versão revisada e explique brevemente as principais mudanças. Não substitua nem grave o arquivo original.')}>Revisar um texto</button>
      <button onClick={() => send('Transforme o tema ou pesquisa que eu indicar em roteiro de apresentação: sequência de slides, título, pontos principais, sugestão visual e fontes verificáveis. Pergunte o tema se não estiver no contexto; não invente referências nem diga que criou um arquivo de slides.')}>Roteiro de apresentação</button>
      <button onClick={() => send('Resuma meus e-mails não lidos ou recentes. Use somente uma conta conectada e as ferramentas disponíveis; se não houver uma conta autenticada, diga como conectá-la. Destaque mensagens importantes e proponha respostas, mas não envie, arquive ou altere e-mails sem minha confirmação explícita.')}>Resumir e-mails</button>
    </div>
    <label>Cidade para o clima<input aria-label="Cidade para o clima" maxLength={120} placeholder="Ex.: Balsas, Maranhão" value={workspace.settings.city} onChange={(event) => workspace.setSettings({ city: event.target.value })} /></label>
    <label>Assuntos para notícias do briefing<input aria-label="Assuntos para notícias" maxLength={300} value={workspace.settings.newsTopics} onChange={(event) => workspace.setSettings({ newsTopics: event.target.value })} placeholder="Ex.: tecnologia, economia, futebol" /></label>
    <label>Perfil de atividade<select aria-label="Perfil de atividade" value={workspace.settings.mode} onChange={(event) => workspace.setSettings({ mode: event.target.value as typeof workspace.settings.mode })}><option value="assistente">Pessoal</option><option value="desenvolvimento">Desenvolvimento</option><option value="analise">Análise de sistemas</option><option value="tutor">Estudos</option></select></label>
    <label>Perfil de rotina<select aria-label="Perfil de rotina" value={workspace.settings.activityProfile} onChange={(event) => workspace.setSettings({ activityProfile: event.target.value as typeof workspace.settings.activityProfile })}><option value="pessoal">Pessoal</option><option value="trabalho">Trabalho</option><option value="estudo">Estudos</option><option value="descanso">Descanso</option></select></label>
    <label><input aria-label="Modo privacidade" type="checkbox" checked={workspace.settings.privacyMode} onChange={(event) => workspace.setSettings({ privacyMode: event.target.checked })} />Modo privacidade: pausar microfone e memória pessoal</label>
    <p>O modo privacidade interrompe a escuta, não envia memória nem histórico e não grava novas conversas neste dispositivo. Pedidos digitados continuam usando a conexão de IA configurada; peça explicitamente quando quiser uma pesquisa web.</p>
    <h3>Biblioteca de conhecimento</h3>
    <label>Pasta autorizada<select aria-label="Pasta da biblioteca" value={draft.rootId} onChange={(event) => change({ rootId: event.target.value })}><option value="">Escolha uma pasta</option>{snapshot.roots.map((root) => <option key={root.id} value={root.id}>{root.name} — {root.path}</option>)}</select></label>
    <label>Pesquisar nos materiais<input aria-label="Buscar nos materiais" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} /></label>
    <button disabled={!query.trim() || !draft.rootId} onClick={() => send(`Pesquise usando materials_search na pasta autorizada de rootId ${JSON.stringify(draft.rootId)} o texto ${JSON.stringify(query)}. Mostre arquivos, páginas ou linhas e trechos. Informe os limites da busca.`)}>Buscar PDFs e anotações</button>
    <p>Autorize novas pastas na seção Arquivos. A busca percorre até 30 arquivos e as primeiras dez páginas de cada PDF por pedido.</p>
    <h3>{draft.id ? 'Editar registro' : 'Novo registro'}</h3>
    <label>Tipo<select aria-label="Tipo do registro" value={draft.kind} onChange={(event) => change({ kind: event.target.value })}>{[['perfil', 'Perfil pessoal'], ['projeto', 'Memória de projeto'], ['tarefa', 'Tarefa'], ['estudo', 'Acompanhamento de estudos'], ['diario', 'Diário de desenvolvimento'], ['lembrete', 'Lembrete'], ['rotina', 'Rotina por voz']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Título<input aria-label="Título do registro" value={draft.title} maxLength={160} onChange={(event) => change({ title: event.target.value })} placeholder="Ex.: Sistema de estoque ou Estudar SQL" /></label>
    <label>Notas, preferências ou dificuldades<textarea aria-label="Notas do registro" rows={4} value={draft.notes} maxLength={6000} onChange={(event) => change({ notes: event.target.value })} /></label>
    <label>Próximo passo<input aria-label="Próximo passo" value={draft.next} maxLength={2000} onChange={(event) => change({ next: event.target.value })} /></label>
    <label>Situação<select aria-label="Situação do registro" value={draft.status} onChange={(event) => change({ status: event.target.value })}>{['pendente', 'executando', 'aguardando você', 'concluído', 'falhou'].map((name) => <option key={name}>{name}</option>)}</select></label>
    <label>Arquivo relacionado (dentro da pasta escolhida)<input aria-label="Arquivo do registro" value={draft.file} maxLength={500} onChange={(event) => change({ file: event.target.value })} /></label>
    {draft.kind === 'lembrete' && <label>Data e hora (horário de Brasília)<input aria-label="Data do lembrete" type="datetime-local" value={draft.due ? new Date(draft.due).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16) : ''} onChange={(event) => change({ due: event.target.value ? event.target.value + ':00-03:00' : '' })} /></label>}
    {draft.kind === 'lembrete' && <label>Contexto opcional (app ou projeto)<input aria-label="Contexto do lembrete" value={draft.context} maxLength={120} onChange={(event) => change({ context: event.target.value })} placeholder="Ex.: Word, VS Code ou Projeto Atlas" /></label>}
    {draft.kind === 'rotina' && <>
      <p>Escolha os aplicativos para esta rotina. Para outros aplicativos cadastrados, peça por voz. O projeto usa a pasta escolhida acima.</p>
      {['vscode', 'word', 'excel', 'explorer', 'calculator'].map((appId) => <label key={appId}><input type="checkbox" checked={draft.steps.some((step) => step.appId === appId)} onChange={(event) => change({ steps: event.target.checked ? [...draft.steps, { appId, ...(draft.rootId && ['vscode', 'explorer'].includes(appId) ? { rootId: draft.rootId, ...(draft.file ? { file: draft.file } : {}) } : {}) }] : draft.steps.filter((step) => step.appId !== appId) })} />{({ vscode: 'VS Code', word: 'Word', excel: 'Excel', explorer: 'Explorador de arquivos', calculator: 'Calculadora' })[appId]}</label>)}
      <label><input type="checkbox" checked={draft.newWord} onChange={(event) => change({ newWord: event.target.checked })} />Criar documento Word para estudar</label>
      <label>Cronômetro em minutos (0 desativa)<input aria-label="Minutos da rotina" type="number" min="0" max="240" value={draft.minutes} onChange={(event) => change({ minutes: Math.max(0, Math.min(240, Math.floor(Number(event.target.value) || 0))) })} /></label>
    </>}
    <div className="workspace-row"><button disabled={busy || !draft.title.trim()} onClick={() => { void save() }}>Salvar registro</button><button onClick={() => setDraft(empty())}>Limpar formulário</button></div>
    <p role="status">{message}</p>
    <h3>Pedidos recentes</h3>
    <p>Acompanhe o processamento dos últimos pedidos. “Concluído” aqui indica que a resposta terminou; confira o resultado de cada ação.</p>
    <button onClick={() => { if (window.confirm('Apagar o registro dos pedidos recentes?')) void request({ action: 'clearActivities' }).then(refresh).catch((error) => setMessage(error.message)) }}>Limpar pedidos recentes</button>
    {snapshot.activities?.slice(0, 15).map((item) => <article className="assistant-entry" key={item.id}><b>{item.title}</b><small>{item.status}</small><p>{item.notes}</p></article>)}
    <h3>Projetos, tarefas e histórico de trabalho</h3>
    <button onClick={() => { void refresh().catch((error) => setMessage(error.message)) }}>Atualizar central</button>
    {snapshot.entries.map((entry) => <article className="assistant-entry" key={entry.id}>
      <b>{entry.title}</b><small>{entry.kind} · {entry.status} · {new Date(entry.updated).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>
      <p>{entry.notes}</p>{entry.next && <p>Próximo passo: {entry.next}</p>}{entry.due && <p>Quando: {new Date(entry.due).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}{entry.context && <p>Contexto: {entry.context}</p>}
      <div className="workspace-row"><button onClick={() => setDraft({ ...entry })}>Editar</button>
        <button onClick={() => send(entry.kind === 'rotina' ? `Execute a rotina ${JSON.stringify(entry.title)}, id ${entry.id}, usando routine_run. Confirme cada abertura e relate falhas.` : `Consulte assistant_overview e retome o registro ${entry.id}, ${JSON.stringify(entry.title)}. Explique o próximo passo e me ajude a continuar. Use arquivos autorizados se necessário; não invente progresso.`)}>{entry.kind === 'rotina' ? 'Executar rotina' : 'Continuar'}</button>
        <button onClick={() => { if (window.confirm(`Excluir ${entry.title}?`)) void request({ action: 'delete', id: entry.id }).then(refresh).catch((error) => setMessage(error.message)) }}>Excluir</button></div>
    </article>)}
    <p>Lembretes precisam do serviço do JARVIS ativo. O computador desligado não será acordado. Registros desta central são separados do histórico do navegador.</p>
  </>
}
