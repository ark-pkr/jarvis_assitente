import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ProjectFiles } from './projects.mjs'
import { PdfLessons, LessonPresenter } from './lessons.mjs'

const yes = async () => ({ approved: true })
const no = async () => ({ approved: false })
function fixturePdf() {
  const stream = String.raw`BT /F1 18 Tf 50 700 Td (Aula de Python: repeticoes) Tj 0 -30 Td (for numero in range\(3\): print\(numero\)) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}
async function fixture() {
  const area = path.resolve('.ui-check.local'); await fs.mkdir(area, { recursive: true })
  const base = await fs.mkdtemp(path.join(area, 'lessons-'))
  const directory = path.join(base, 'aulas'); await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, 'aula.pdf'), fixturePdf())
  const files = new ProjectFiles(path.join(base, 'journal'))
  const root = await files.register(directory, yes)
  const pdf = new PdfLessons(files)
  const source = await pdf.read({ rootId: root.id, file: 'aula.pdf' })
  return { files, root, pdf, source, directory }
}
test('reads real PDF text, renders pages, and enforces source boundaries', async () => {
  const { root, pdf, source, directory } = await fixture()
  assert.equal(source.totalPages, 1)
  assert.match(source.pages[0].text, /Aula de Python/)
  const image = await pdf.read({ rootId: root.id, file: 'aula.pdf', includeImages: true })
  assert.equal(image.images[0].mimeType, 'image/png')
  assert.equal(image.images[0].page, 1)
  assert.equal(image.pages[0].imageIncluded, true)
  assert.ok(image.images[0].data.length > 100)
  await assert.rejects(pdf.read({ rootId: 'unknown', file: 'aula.pdf' }), /autorizada/)
  await assert.rejects(pdf.read({ rootId: root.id, file: '../aula.pdf' }), /fora da pasta/)
  await assert.rejects(pdf.read({ rootId: root.id, file: 'aula.pdf', lastPage: 6 }), /cinco/)
  await fs.appendFile(path.join(directory, 'aula.pdf'), '\nchanged')
  await assert.rejects(pdf.source(source.sourceId), /mudou/)
})
test('Word lesson shows source and example only after approval', async () => {
  const { files, pdf, source } = await fixture()
  const inserted = []; let created = 0
  const office = { newDocument: async () => { created++; return { id: 'doc' } }, append: async (id, text) => { inserted.push(text); return { id } } }
  const presenter = new LessonPresenter({ files, pdf, office })
  const args = {
    sourceId: source.sourceId, target: 'word', topic: 'Repetições',
    explanation: 'Um laço repete uma ação.', example: 'for numero in range(3): print(numero)',
    codeWalkthrough: 'range(3) produz 0, 1 e 2; print mostra cada valor.',
    tableWalkthrough: 'Na página 1, a tabela relaciona cada volta ao número exibido.',
    commonMistakes: 'O limite final de range não é incluído.',
  }
  await assert.rejects(presenter.present(args, no), /cancelada/)
  assert.equal(created, 0)
  const result = await presenter.present(args, yes)
  assert.equal(result.documentId, 'doc'); assert.equal(created, 1)
  assert.match(inserted[0], /aula.pdf, páginas 1 a 1/)
  assert.match(inserted[0], /Um laço repete/)
  assert.match(inserted[0], /Como funciona, passo a passo/)
  assert.match(inserted[0], /Como interpretar a tabela/)
  assert.match(inserted[0], /Erros comuns/)
  assert.match(result.narration, /range\(3\) produz/)
  assert.match(result.narration, /tabela relaciona/)
  assert.match(result.next, /exercício opcional/)
  assert.equal(presenter.recent[0].sourceId, source.sourceId)
})
test('Code example is saved and opened, cancellation and source changes prevent writes', async () => {
  const { files, root, pdf, source, directory } = await fixture()
  const launches = []
  const presenter = new LessonPresenter({ files, pdf, apps: { open: async (args) => { launches.push(args); return { opened: true } } } })
  const args = { sourceId: source.sourceId, target: 'vscode', rootId: root.id, file: 'exemplo.py', topic: 'Laços', explanation: 'Repete três vezes.', example: 'for numero in range(3):\n    print(numero)\n' }
  await assert.rejects(presenter.present(args, no), /cancelada/)
  await assert.rejects(fs.stat(path.join(directory, args.file)), { code: 'ENOENT' })
  const result = await presenter.present(args, yes)
  assert.equal((await files.read(root.id, args.file)).text, args.example)
  assert.equal(launches[0].appId, 'vscode'); assert.equal(launches.length, 1)
  assert.ok(result.changeId)
  await assert.rejects(presenter.present({ ...args, file: 'outro.py' }, async () => {
    await fs.appendFile(path.join(directory, 'aula.pdf'), '\nchanged'); return { approved: true }
  }), /mudou/)
  await assert.rejects(fs.stat(path.join(directory, 'outro.py')), { code: 'ENOENT' })
})
