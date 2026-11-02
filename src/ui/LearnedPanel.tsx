import { useEffect, useState } from 'react'
import { BRIDGE_HTTP_URL } from '../config'
import { useWorkspace } from '../workspace'

type Item = { id: string; text: string; at: number }
type Summary = { id: string; title: string; text: string; at: number }
type Followup = { id: string; about: string; date: string }
type State = { facts: Item[]; summaries: Summary[]; words: string[]; followups: Followup[] }

const day = (at: number) => new Date(at).toLocaleDateString('pt-BR')

/** Everything he picked up on his own, where it can be read and taken back. */
export function LearnedPanel() {
  const workspace = useWorkspace()
  const [state, setState] = useState<State | null>(null)
  const [message, setMessage] = useState('')
  const change = (body: object) => {
    void fetch(`${BRIDGE_HTTP_URL}/learned`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json()).then(setState).catch(() => setMessage('O serviço local não respondeu.'))
  }
  useEffect(() => {
    void fetch(`${BRIDGE_HTTP_URL}/learned`).then((response) => response.json()).then(setState).catch(() => setMessage('O serviço local não respondeu.'))
  }, [])
  const empty = state && !state.facts.length && !state.summaries.length
  return <>
    <h3>O que ele aprendeu sozinho</h3>
    <label><input aria-label="Aprender com as conversas" type="checkbox" checked={workspace.settings.learn} onChange={(event) => workspace.setSettings({ learn: event.target.checked })} />Aprender com as conversas</label>
    <p>Ele lê só o que você disse, nunca páginas ou arquivos, e fica salvo neste computador. Senhas e documentos são ignorados. O que está aqui é contexto e nunca autoriza uma ação. No modo privacidade, nada é lido nem guardado.</p>
    {message && <p role="alert">{message}</p>}
    {empty && <p>Ainda não há nada aqui.</p>}
    {state?.facts.map((fact) => <div className="workspace-row" key={fact.id}><span>{fact.text}</span><button onClick={() => change({ action: 'forget', id: fact.id })}>Esquecer</button></div>)}
    <label><input aria-label="Puxar assunto" type="checkbox" checked={workspace.settings.initiative} onChange={(event) => workspace.setSettings({ initiative: event.target.checked })} />Deixar ele puxar assunto</label>
    <p>No máximo uma vez por dia, entre 9h e 21h, quando você estiver por perto e sem nada em andamento.</p>
    {Boolean(state?.followups?.length) && <h3>Vou perguntar depois</h3>}
    {state?.followups?.map((item) => <div className="workspace-row" key={item.id}><span>{item.about}, {new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</span><button onClick={() => change({ action: 'forget', id: item.id })}>Esquecer</button></div>)}
    {Boolean(state?.summaries.length) && <h3>Conversas anteriores</h3>}
    {state?.summaries.map((item) => <div className="workspace-row" key={item.id}><span><b>{day(item.at)}, {item.title}.</b> {item.text}</span><button onClick={() => change({ action: 'forget', id: item.id })}>Esquecer</button></div>)}
    {Boolean(state?.words.length) && <p>Palavras que ele aprendeu a transcrever: {state?.words.join(', ')}.</p>}
    {state && !empty && <button className="danger" onClick={() => { if (window.confirm('Apagar tudo o que ele aprendeu sozinho?')) change({ action: 'clear' }) }}>Apagar tudo o que ele aprendeu</button>}
  </>
}
