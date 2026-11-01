import test from 'node:test'
import assert from 'node:assert/strict'
import { WordOffice } from './word.mjs'
const yes = async () => ({ approved: true })
const no = async () => ({ approved: false })

test('new and read do nothing when approval is refused', async () => {
  const actions = []
  const office = new WordOffice({ invoke: async (request) => { actions.push(request.action); return { documents: [{ id: 'doc1', name: 'Documento1' }] } } })
  await assert.rejects(() => office.newDocument(no), /cancelada/)
  assert.deepEqual(actions, [])
  await assert.rejects(() => office.read('doc1', no), /cancelada/)
  assert.deepEqual(actions, ['list'])
})
test('append targets a document and version, preserves literal text, and requires approval', async () => {
  const actions = []
  const office = new WordOffice({ invoke: async (request) => {
    actions.push(request)
    return request.action === 'inspect' ? { id: 'doc1', name: 'Documento1', hash: 'version1', readOnly: false } : { id: 'doc1', name: 'Documento1', inserted: true, characters: 10 }
  } })
  await assert.rejects(() => office.append('doc1', 'Bom dia', true, no), /cancelada/)
  assert.equal(actions.some((request) => request.action === 'append'), false)
  const text = 'Olá, ação em português. $x; "texto"'
  const result = await office.append('doc1', text, true, yes)
  assert.equal(result.inserted, true)
  assert.deepEqual(actions.at(-1), { action: 'append', documentId: 'doc1', expectedHash: 'version1', text, newParagraph: true })
})
test('read-only documents and unauthorized save destinations are rejected', async () => {
  let approved = false
  const office = new WordOffice({ invoke: async () => ({ readOnly: true }), files: { resolve: async () => { throw new Error('fora da pasta autorizada') } } })
  await assert.rejects(() => office.append('doc', 'Bom dia', true, async () => { approved = true; return { approved: true } }), /somente leitura/)
  assert.equal(approved, false)
  await assert.rejects(() => office.save('doc', 'root', '../file.docx', yes), /fora da pasta/)
  await assert.rejects(() => office.save('doc', 'root', 'file.docm', yes), /docx/)
})
