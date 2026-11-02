import { useEffect, useState } from 'react'
import { BRIDGE_HTTP_URL } from '../config'

type Task = { id: string; title: string; status: string; summary: string; error: string; started: number }

const post = (body: object) => fetch(`${BRIDGE_HTTP_URL}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((response) => response.json())

/** Research that ran while the conversation carried on. */
export function TasksPanel({ send }: { send: (prompt: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  useEffect(() => {
    const refresh = () => { void fetch(`${BRIDGE_HTTP_URL}/tasks`).then((response) => response.json()).then((state: { tasks: Task[] }) => setTasks(state.tasks)).catch(() => {}) }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])
  const change = (body: object) => { void post(body).then((state: { tasks?: Task[] }) => { if (state.tasks) setTasks(state.tasks) }).catch(() => {}) }
  return <>
    <h3>Pesquisas em segundo plano</h3>
    <p>Diga “pesquisa isso e me avisa”. Ele continua conversando e avisa quando terminar. Só pesquisa: nunca compra, envia ou altera nada.</p>
    {tasks.slice(0, 8).map((task) => <article className="assistant-entry" key={task.id}>
      <b>{task.title}</b><small>{task.status}</small>
      {(task.summary || task.error) && <p>{task.summary || task.error}</p>}
      <div className="workspace-row">
        {task.status === 'executando' && <button onClick={() => change({ action: 'cancel', id: task.id })}>Cancelar</button>}
        {task.status === 'concluída' && <button onClick={() => send(`Use task_result com o id ${task.id}, fale a conclusão e mostre detalhes e fontes em um painel.`)}>Ver resultado</button>}
        {task.status !== 'executando' && <button onClick={() => change({ action: 'delete', id: task.id })}>Excluir</button>}
      </div>
    </article>)}
  </>
}
