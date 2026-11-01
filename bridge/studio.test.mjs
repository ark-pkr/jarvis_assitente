import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ProjectFiles } from './projects.mjs'
import { handleLessonPdf } from './studio.mjs'
test('PDF preview requires authorized root and PDF format, supports ranges without exposing other files', async () => {
  await fs.mkdir('.ui-check.local', { recursive: true })
  const base = await fs.mkdtemp(path.resolve('.ui-check.local/pdf-preview-'))
  const folder = path.join(base, 'aulas'); await fs.mkdir(folder)
  const body = '%PDF-1.4\nfixture for endpoint\n%%EOF'
  await fs.writeFile(path.join(folder, 'aula.pdf'), body)
  await fs.writeFile(path.join(folder, '.env.local'), 'private')
  const files = new ProjectFiles(path.join(base, 'journal'))
  const root = await files.register(folder, async () => ({ approved: true }))
  async function request(file, range, rootId = root.id) {
    const result = {}
    const res = { writeHead: (status, headers) => { result.status = status; result.headers = headers }, end: (value) => { result.body = value } }
    await handleLessonPdf({ url: `/lesson-pdf?rootId=${encodeURIComponent(rootId)}&file=${encodeURIComponent(file)}`, headers: range ? { range } : {} }, res, {}, files)
    return result
  }
  assert.equal((await request('aula.pdf')).body.toString(), body)
  const range = await request('aula.pdf', 'bytes=0-7')
  assert.equal(range.status, 206); assert.equal(range.body.toString(), '%PDF-1.4')
  assert.equal((await request('aula.pdf', 'bytes=999999-')).status, 416)
  assert.equal((await request('.env.local')).status, 400)
  assert.equal((await request('../aula.pdf')).status, 400)
  assert.equal((await request('aula.pdf', undefined, 'unknown')).status, 400)
})
