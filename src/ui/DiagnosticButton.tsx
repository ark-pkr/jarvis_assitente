import { useState } from 'react'
import { diagnosticText } from '../lib/diagnostics'

export function DiagnosticButton() {
  const [message, setMessage] = useState('')
  const copy = async () => {
    try {
      const text = await diagnosticText()
      await (window.jarvisDesktop ? window.jarvisDesktop.copyText(text) : navigator.clipboard.writeText(text))
      setMessage('Diagnóstico copiado. Basta colar onde quiser.')
    } catch (error) { setMessage((error as Error).message) }
  }
  return <>
    <h3>Diagnóstico</h3>
    <p>Copia versão, estado da voz e os últimos erros, para descobrir o que falhou. Chaves, e-mails e sua pasta de usuário são removidos, e as conversas não entram. Confira o texto antes de enviar a alguém.</p>
    <button onClick={() => void copy()}>Copiar diagnóstico</button>
    <p role="status">{message}</p>
  </>
}
