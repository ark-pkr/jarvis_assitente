import { useEffect, useState } from 'react'
import { BRIDGE_HTTP_URL } from '../config'
import { useStore } from '../store'

type Notes = { summary: string; highlights: string[]; dates: string[]; tasks: string[] }
type Lecture = { id: string; title: string; started: number; minutes: number; lost: number; words: number; notes: Notes | null }

const post = (body: object) => fetch(`${BRIDGE_HTTP_URL}/lecture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** The classes he wrote down, and the way into the next one. */
export function LecturePanel({ send }: { send: (prompt: string) => void }) {
  const live = useStore((s) => s.lecture)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [message, setMessage] = useState('')
  const refresh = () => fetch(`${BRIDGE_HTTP_URL}/lecture`).then((response) => response.json()).then((state: { lectures: Lecture[] }) => setLectures(state.lectures)).catch(() => setMessage('O serviço local não respondeu.'))
  useEffect(() => { void refresh() }, [live])
  const organise = (id: string) => {
    setMessage('Organizando as anotações…')
    void post({ action: 'finish', id }).then(refresh).then(() => setMessage('')).catch(() => setMessage('Não consegui organizar agora.'))
  }
  return <>
    <h3>Modo aula</h3>
    <p>Ele ouve a aula calado e, no fim, entrega resumo, datas de prova e o que o professor destacou. A cada minuto o áudio vai ao Google para virar texto; o áudio não fica salvo e o texto fica neste computador. Grave só com autorização de quem estiver falando.</p>
    {!live && <button onClick={() => send('Modo aula')}>Começar modo aula</button>}
    {live && <p role="status">Gravando. Diga “Jarvis, encerrar aula” ou use o botão no topo da tela.</p>}
    {message && <p role="status">{message}</p>}
    {lectures.map((lecture) => <article className="assistant-entry" key={lecture.id}>
      <b>{lecture.title}</b><small>{new Date(lecture.started).toLocaleDateString('pt-BR')} · {lecture.minutes} min · {lecture.words} palavras{lecture.lost ? ` · ${lecture.lost} min perdidos` : ''}</small>
      {lecture.notes ? <p>{lecture.notes.summary}</p> : <p>Sem anotações ainda.</p>}
      {Boolean(lecture.notes?.dates.length) && <p>Datas: {lecture.notes?.dates.join('; ')}</p>}
      <div className="workspace-row">
        {!lecture.notes && lecture.words > 0 && <button onClick={() => organise(lecture.id)}>Gerar anotações</button>}
        {lecture.words > 0 && <button onClick={() => send(`Me testa na aula de id ${lecture.id}, ${JSON.stringify(lecture.title)}. Use quiz_start com lectureId.`)}>Me testar nesta aula</button>}
        <button onClick={() => { if (window.confirm(`Excluir ${lecture.title}?`)) void post({ action: 'delete', id: lecture.id }).then(refresh) }}>Excluir</button>
      </div>
    </article>)}
  </>
}
