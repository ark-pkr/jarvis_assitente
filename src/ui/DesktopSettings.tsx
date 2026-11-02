import { useEffect, useState } from 'react'
import { useWorkspace } from '../workspace'
export function DesktopSettings() {
  const [key, setKey] = useState('')
  const [model, setModel] = useState('gemini-3.5-flash')
  const [login, setLogin] = useState(false)
  const [contextReminders, setContextReminders] = useState(false)
  const [autoActivate, setAutoActivate] = useState(false)
  const [clapToStart, setClapToStart] = useState(false)
  const [miniOrb, setMiniOrb] = useState(true)
  const [hotkey, setHotkey] = useState('Control+Alt+J')
  const [hotkeyError, setHotkeyError] = useState('')
  const [localWake, setLocalWake] = useState(true)
  const [wakeConfigured, setWakeConfigured] = useState(false)
  const [wakeKey, setWakeKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const workspace = useWorkspace()
  const [calendar, setCalendar] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const linkCalendar = (work: Promise<void> | undefined, waiting: string) => {
    setBusy(true); setMessage(waiting)
    void work?.then(() => setMessage('Pronto. Reiniciando o serviço...')).catch((error: Error) => { setMessage(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); setBusy(false) })
  }
  useEffect(() => { void window.jarvisDesktop?.settings().then((settings) => { setCalendar(settings.calendarConnected); setConfigured(settings.configured); setModel(settings.model); setLogin(settings.startOnLogin); setContextReminders(settings.contextReminders); setAutoActivate(settings.autoActivate); setClapToStart(settings.clapToStart); setMiniOrb(settings.miniOrb); setHotkey(settings.hotkey); setHotkeyError(settings.hotkeyError); setLocalWake(settings.localWake); setWakeConfigured(settings.wakeConfigured) }).catch(() => setMessage('Não foi possível ler as configurações.')) }, [])
  return <>
    <h3>Aplicativo para Windows</h3>
    <p>Gemini: {configured ? 'chave configurada' : 'configure sua chave para começar'}. A chave fica protegida pela sua conta do Windows e não aparece no instalador.</p>
    <label>Chave da API Gemini<input aria-label="Chave Gemini" type="password" autoComplete="off" maxLength={200} value={key} onChange={(event) => setKey(event.target.value)} placeholder={configured ? 'Preencha apenas para substituir' : 'Sua chave Gemini'} /></label>
    <label>Modelo Gemini<input aria-label="Modelo Gemini" value={model} maxLength={80} onChange={(event) => setModel(event.target.value)} /></label>
    <label><input aria-label="Iniciar com Windows" type="checkbox" checked={login} onChange={(event) => setLogin(event.target.checked)} />Iniciar ao entrar no Windows</label>
    <label><input aria-label="Lembretes contextuais" type="checkbox" checked={contextReminders} onChange={(event) => setContextReminders(event.target.checked)} />Ativar lembretes pelo aplicativo ativo</label>
    <p>Quando ativado, o JARVIS consulta localmente o nome do aplicativo e título da janela a cada 20 segundos para comparar com lembretes contextuais. Esses dados não são gravados nem enviados à internet; o recurso fica desligado por padrão.</p>
    <h3>Sempre por perto</h3>
    <label><input aria-label="Ativar ao abrir" type="checkbox" checked={autoActivate} onChange={(event) => setAutoActivate(event.target.checked)} />Ativar sozinho ao abrir, sem clicar</label>
    <p>Abre o microfone assim que o aplicativo inicia. Ao entrar no Windows, ele sobe em segundo plano, com a janela fechada.</p>
    <label><input aria-label="Palma para ativar" type="checkbox" checked={clapToStart} onChange={(event) => setClapToStart(event.target.checked)} />Bater palma para ativar</label>
    <p>Mantém o microfone aberto na tela inicial, só para medir o som. Nada é enviado à internet até ele ativar.</p>
    <label><input aria-label="Mini esfera" type="checkbox" checked={miniOrb} onChange={(event) => setMiniOrb(event.target.checked)} />Mostrar a mini esfera quando a janela não estiver em foco</label>
    <label>Atalho global<input aria-label="Atalho global" value={hotkey} maxLength={40} onChange={(event) => setHotkey(event.target.value)} /></label>
    <p>Chama o JARVIS de dentro de qualquer programa. Exemplos: Control+Alt+J, Alt+Shift+J.</p>
    {hotkeyError && <p role="alert">{hotkeyError}</p>}
    <label><input aria-label="Entender o isso" type="checkbox" checked={workspace.settings.windowContext} onChange={(event) => workspace.setSettings({ windowContext: event.target.checked })} />Entender “isso” pelo programa aberto</label>
    <p>Em pedidos como “resume isso”, ele envia ao Gemini o nome do programa e o título da janela. Ver o conteúdo da tela continua pedindo confirmação. Desligado por padrão.</p>
    <h3>Google Agenda</h3>
    {calendar ? <>
      <p>Conectada. Ele lê seus eventos e pede confirmação antes de criar, alterar ou excluir.</p>
      <button disabled={busy} onClick={() => linkCalendar(window.jarvisDesktop?.disconnectCalendar(), 'Desconectando...')}>Desconectar a Google Agenda</button>
    </> : <>
      <p>Crie um cliente do tipo “App para computador” no Google Cloud e cole os dados abaixo. O passo a passo está no README. A senha fica só no navegador, e a autorização é guardada protegida pela sua conta do Windows.</p>
      <label>ID do cliente<input aria-label="ID do cliente Google" autoComplete="off" maxLength={200} value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
      <label>Chave do cliente<input aria-label="Chave do cliente Google" type="password" autoComplete="off" maxLength={200} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} /></label>
      <button disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={() => linkCalendar(window.jarvisDesktop?.connectCalendar({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }), 'Conclua a autorização no navegador...')}>Conectar a Google Agenda</button>
    </>}
    <h3>Palavra de ativação no computador</h3>
    <label><input aria-label="Ativação local" type="checkbox" checked={localWake} onChange={(event) => setLocalWake(event.target.checked)} />Detectar “Jarvis” no computador</label>
    <p>{wakeConfigured ? 'Chave Picovoice disponível.' : 'Sem chave Picovoice, o que o microfone capta vai ao Gemini para saber se você chamou o JARVIS.'} Com a detecção local, só o que vier depois do nome sai do computador. Durante uma resposta, dizer “Jarvis” também o interrompe.</p>
    <label>Chave pessoal Picovoice<input aria-label="Chave Picovoice para ativação" type="password" autoComplete="off" maxLength={200} value={wakeKey} onChange={(event) => setWakeKey(event.target.value)} placeholder={wakeConfigured ? 'Preencha apenas para substituir' : 'Gratuita em console.picovoice.ai'} /></label>
    <button disabled={busy || (!configured && !key.trim())} onClick={() => { setBusy(true); setMessage('Salvando e reiniciando o serviço...'); void window.jarvisDesktop?.saveSettings({ apiKey: key.trim() || undefined, model, startOnLogin: login, contextReminders, autoActivate, clapToStart, miniOrb, hotkey: hotkey.trim(), localWake, wakeKey: wakeKey.trim() || undefined }).catch(() => { setMessage('Não foi possível salvar. Verifique a chave e o modelo.'); setBusy(false) }) }}>Salvar configurações</button>
    <p role="status">{message}</p>
    <p>Com a proteção de voz ativa, a identificação do perfil é feita localmente antes de enviar o trecho aprovado ao Gemini. O áudio bruto do cadastro não é armazenado.</p>
    <p>A transcrição e as respostas precisam de internet e consomem a cota da API Gemini.</p>
    <p>Fechar a janela mantém o assistente na bandeja. Para encerrar o microfone e os serviços, use “Sair do JARVIS” no menu do ícone.</p>
  </>
}
