import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { WordOffice, callWord } from '../bridge/word.mjs'
import { ProjectFiles } from '../bridge/projects.mjs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const yes = async () => ({ approved: true })
await fs.mkdir('.ui-check.local', { recursive: true })
const directory = await fs.mkdtemp(path.resolve('.ui-check.local/word-'))
const files = new ProjectFiles(path.join(directory, 'journal'))
const root = await files.register(directory, yes)
const office = new WordOffice({ files })
const before = await office.list()
const created = await office.newDocument(yes)
assert.ok(!before.documents.some((doc) => doc.id === created.id))
await office.append(created.id, 'Bom dia', true, yes)
await office.append(created.id, 'Olá, ação em português.', true, yes)
const content = await callWord({ action: 'inspect', documentId: created.id })
assert.match(content.text, /Bom dia/)
assert.match(content.text, /Olá, ação em português/)
// Simulate a stale preview: Word must refuse the old content version.
await assert.rejects(() => callWord({ action: 'append', documentId: created.id, expectedHash: created.hash, text: 'não aplicar', newParagraph: true }), /changed after preview/)
const saved = await office.save(created.id, root.id, 'word-integration.docx', yes)
assert.ok((await fs.stat(saved.savedTo)).size > 0)
const after = await office.list()
assert.ok(before.documents.every((doc) => after.documents.some((entry) => entry.id === doc.id)))
await new Promise((resolve, reject) => {
  const process = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-File', fileURLToPath(new URL('./close-word-test.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'ignore', 'inherit'] })
  process.on('error', reject); process.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Documento de teste ficou aberto.')))
  process.stdin.end(JSON.stringify({ path: saved.savedTo }), 'utf8')
})
console.log(JSON.stringify({ status: 'PASS', testDocument: saved.name, textInserted: true, unicode: true, staleEditRejected: true, saved: true, originalDocumentsPreserved: true }))
