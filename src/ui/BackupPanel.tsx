import { useEffect, useRef, useState } from 'react'
import { backupStatus, restoreBackup, saveBackup, type BackupStatus } from '../lib/backup'

export function BackupPanel({ onBeforeRestore }: { onBeforeRestore: () => void }) {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const refresh = () => { void backupStatus().then(setStatus).catch(() => setMessage('O serviço local não respondeu.')) }
  useEffect(refresh, [])
  const save = async () => {
    setBusy(true)
    try { const { file } = await saveBackup(); setMessage(`Backup salvo em ${file}.`); refresh() }
    catch (error) { setMessage((error as Error).message) }
    setBusy(false)
  }
  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!window.confirm(`Substituir tudo o que está aqui pelo conteúdo de ${file.name}? Uma cópia do estado atual será salva antes.`)) return
    setBusy(true)
    onBeforeRestore()
    try { await restoreBackup(await file.text()) }
    catch (error) { setMessage((error as Error).message); setBusy(false) }
  }
  return <>
    <h3>Backup</h3>
    <p>Guarda conversas, memória, o que ele aprendeu, lembretes, aulas, provas e ajustes. Uma cópia automática é feita por semana. Chaves e logins nunca entram: depois de restaurar em outro computador, informe a chave de novo.</p>
    <p>{status ? <>Pasta: {status.folder}<br />Último backup: {status.last ? new Date(status.last).toLocaleString('pt-BR') : 'nenhum ainda'}</> : 'Consultando…'}</p>
    <div className="workspace-row"><button disabled={busy} onClick={() => void save()}>Fazer backup agora</button>
      <button disabled={busy} onClick={() => picker.current?.click()}>Restaurar backup</button></div>
    <input ref={picker} type="file" accept=".json,application/json" aria-label="Arquivo de backup" hidden onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = '' }} />
    <p>O arquivo não tem senha e contém dados pessoais. Se a pasta Documentos sincroniza com a nuvem, ele vai junto. Para proteger contra perda do disco, copie para um pendrive ou outro lugar.</p>
    <p role="status">{message}</p>
  </>
}
