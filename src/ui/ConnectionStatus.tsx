import { useEffect, useState } from 'react'
import { BRIDGE_HTTP_URL } from '../config'
import { isConnected } from '../lib/bridge'
import { useStore } from '../store'

type Health = { provider?: string; model?: string; apiConfigured?: boolean; browser?: { installed: boolean; connected: boolean; tabs: number } }
export function ConnectionStatus({ detailed = false }: { detailed?: boolean }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [socket, setSocket] = useState(false)
  const [mic, setMic] = useState('não iniciado')
  const [latency, setLatency] = useState(0)
  const error = useStore((s) => s.error)
  useEffect(() => {
    let disposed = false
    const poll = async () => {
      const started = performance.now()
      try {
        const response = await fetch(`${BRIDGE_HTTP_URL}/health`, { signal: AbortSignal.timeout(3000) })
        if (!response.ok) throw new Error('offline')
        const next = await response.json()
        if (!disposed) { setHealth(next); setLatency(Math.round(performance.now() - started)) }
      } catch { if (!disposed) setHealth(null) }
      const voice = (window as unknown as { __voice?: { running?: boolean; lastError?: string } }).__voice
      if (!disposed) {
        setSocket(isConnected())
        setMic(voice?.running ? 'ouvindo' : voice?.lastError ? 'com erro' : 'não iniciado')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 5000)
    return () => { disposed = true; clearInterval(timer) }
  }, [])
  const apiError = error?.startsWith('Gemini:')
  return <div className={`connection-status${detailed ? ' detailed' : ''}`} aria-label="Estado das conexões">
    <span data-ok={Boolean(health && socket)}>Servidor: {health && socket ? 'conectado' : health ? 'disponível' : 'sem conexão'}</span>
    <span data-ok={Boolean(health?.apiConfigured && !apiError)}>Gemini: {apiError ? 'com erro' : health?.apiConfigured ? 'configurado' : 'indisponível'}</span>
    <span data-ok={mic === 'ouvindo'}>Microfone: {mic}</span>
    <span data-ok={Boolean(health?.browser?.installed)}>Chrome: {health?.browser?.connected ? 'conectado' : health?.browser?.installed ? 'pronto' : 'indisponível'}</span>
    {detailed && <p>Modelo: {health?.model || '—'} · Tempo do servidor local: {latency || '—'} ms.<br />
      “Configurado” confirma a presença da chave; disponibilidade e cota da API são verificadas ao enviar um pedido.</p>}
  </div>
}
