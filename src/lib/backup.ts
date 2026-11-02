import { BRIDGE_HTTP_URL } from '../config'
import { replaceWorkspace, workspaceSnapshot } from '../workspace'

export type BackupStatus = { folder: string; last: number }
type Result = { file?: string | null; safety?: string; workspace?: string | null; error?: string }

async function send(body: object): Promise<Result> {
  const response = await fetch(`${BRIDGE_HTTP_URL}/backup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json() as Result
  if (!response.ok) throw new Error(result.error || 'O serviço local não respondeu.')
  return result
}

export const backupStatus = (): Promise<BackupStatus> => fetch(`${BRIDGE_HTTP_URL}/backup`).then((response) => response.json())
export const saveBackup = () => send({ action: 'save', workspace: workspaceSnapshot() })

/** Decides nothing itself: the service knows when the last one was. */
export function automaticBackup() {
  const workspace = workspaceSnapshot()
  if (workspace === null) return
  void send({ action: 'automatic', workspace }).catch((error) => console.warn('[jarvis] backup automático:', error.message))
}

/** Reloads the page on success, so everything on screen comes from the backup. */
export async function restoreBackup(text: string) {
  let snapshot: unknown
  try { snapshot = JSON.parse(text) } catch { throw new Error('Este arquivo não é um backup do JARVIS.') }
  const result = await send({ action: 'restore', snapshot, workspace: workspaceSnapshot() })
  replaceWorkspace(result.workspace ?? null)
  location.reload()
}
