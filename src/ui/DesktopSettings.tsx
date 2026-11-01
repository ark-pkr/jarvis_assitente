import { useEffect, useState } from 'react'
export function DesktopSettings() {
  const [key, setKey] = useState('')
  const [model, setModel] = useState('gemini-3.5-flash')
  const [login, setLogin] = useState(false)
  const [contextReminders, setContextReminders] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void window.jarvisDesktop?.settings().then((settings) => { setConfigured(settings.configured); setModel(settings.model); setLogin(settings.startOnLogin); setContextReminders(settings.contextReminders) }).catch(() => setMessage('Não foi possível ler as configurações.')) }, [])
  return <>
    <h3>Aplicativo para Windows</h3>
    <p>Gemini: {configured ? 'chave configurada' : 'configure sua chave para começar'}. A chave fica protegida pela sua conta do Windows e não aparece no instalador.</p>
    <label>Chave da API Gemini<input aria-label="Chave Gemini" type="password" autoComplete="off" maxLength={200} value={key} onChange={(event) => setKey(event.target.value)} placeholder={configured ? 'Preencha apenas para substituir' : 'Sua chave Gemini'} /></label>
    <label>Modelo Gemini<input aria-label="Modelo Gemini" value={model} maxLength={80} onChange={(event) => setModel(event.target.value)} /></label>
    <label><input aria-label="Iniciar com Windows" type="checkbox" checked={login} onChange={(event) => setLogin(event.target.checked)} />Iniciar ao entrar no Windows</label>
    <label><input aria-label="Lembretes contextuais" type="checkbox" checked={contextReminders} onChange={(event) => setContextReminders(event.target.checked)} />Ativar lembretes pelo aplicativo ativo</label>
    <p>Quando ativado, o JARVIS consulta localmente o nome do aplicativo e título da janela a cada 20 segundos para comparar com lembretes contextuais. Esses dados não são gravados nem enviados à internet; o recurso fica desligado por padrão.</p>
    <button disabled={busy || (!configured && !key.trim())} onClick={() => { setBusy(true); setMessage('Salvando e reiniciando o serviço...'); void window.jarvisDesktop?.saveSettings({ apiKey: key.trim() || undefined, model, startOnLogin: login, contextReminders }).catch(() => { setMessage('Não foi possível salvar. Verifique a chave e o modelo.'); setBusy(false) }) }}>Salvar configurações</button>
    <p role="status">{message}</p>
    <p>Com a proteção de voz ativa, a identificação do perfil é feita localmente antes de enviar o trecho aprovado ao Gemini. O áudio bruto do cadastro não é armazenado.</p>
    <p>A transcrição e as respostas precisam de internet e consomem a cota da API Gemini.</p>
    <p>Fechar a janela mantém o assistente na bandeja. Para encerrar o microfone e os serviços, use “Sair do JARVIS” no menu do ícone.</p>
  </>
}
