import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Backups } from './backup.mjs'

const place = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-backup-'))
  const directory = path.join(root, 'dados')
  await fs.mkdir(path.join(directory, 'lectures'), { recursive: true })
  await fs.writeFile(path.join(directory, 'assistant.json'), '{"reminders":["pagar"]}')
  await fs.writeFile(path.join(directory, 'lectures', 'aula-1.json'), '{"title":"Redes"}')
  await fs.mkdir(path.join(directory, 'browser-profile'))
  await fs.writeFile(path.join(directory, 'browser-profile', 'Cookies'), 'login do usuário')
  await fs.mkdir(path.join(directory, 'voice-cache'))
  await fs.writeFile(path.join(directory, 'voice-cache', 'a.wav'), 'audio')
  return { root, directory, store: new Backups({ directory, folder: path.join(root, 'copias') }) }
}

test('a backup holds what cannot be recomputed and nothing else', async () => {
  const { store } = await place()
  const snapshot = JSON.parse(await fs.readFile(await store.save('{"memory":"oi"}'), 'utf8'))
  assert.deepEqual(Object.keys(snapshot.files).sort(), ['assistant.json', 'lectures/aula-1.json'])
  assert.equal(snapshot.workspace, '{"memory":"oi"}')
  assert.doesNotMatch(JSON.stringify(snapshot), /login do usuário/)
})

test('a restore brings the old state back, and the state it replaced is saved first', async () => {
  const { directory, store } = await place()
  const snapshot = await store.collect('{"memory":"antiga"}')
  await fs.writeFile(path.join(directory, 'assistant.json'), '{"reminders":["novo"]}')
  await fs.writeFile(path.join(directory, 'quiz.json'), '{"topic":"depois do backup"}')
  await fs.writeFile(path.join(directory, 'lectures', 'aula-2.json'), '{"title":"Depois"}')
  const { safety, workspace } = await store.restore(snapshot, '{"memory":"atual"}')
  assert.equal(workspace, '{"memory":"antiga"}')
  assert.match(await fs.readFile(path.join(directory, 'assistant.json'), 'utf8'), /pagar/)
  await assert.rejects(fs.stat(path.join(directory, 'quiz.json')))
  await assert.rejects(fs.stat(path.join(directory, 'lectures', 'aula-2.json')))
  await fs.stat(path.join(directory, 'browser-profile', 'Cookies'))
  const kept = JSON.parse(await fs.readFile(safety, 'utf8'))
  assert.equal(kept.workspace, '{"memory":"atual"}')
  assert.match(kept.files['assistant.json'], /novo/)
  assert.match(kept.files['lectures/aula-2.json'], /Depois/)
})

test('a backup file cannot choose where it writes', async () => {
  const { root, directory, store } = await place()
  for (const name of ['../fora.json', '..\\fora.json', 'lectures/../../fora.json', 'C:/fora.json', 'desktop-settings.json', 'lectures/a/b.json']) {
    await assert.rejects(store.restore({ app: 'jarvis', format: 1, files: { [name]: '{}' }, workspace: null }, null), /danificado/, name)
  }
  await assert.rejects(fs.stat(path.join(root, 'fora.json')))
  assert.match(await fs.readFile(path.join(directory, 'assistant.json'), 'utf8'), /pagar/)
  assert.deepEqual(await store.list(), [], 'um arquivo recusado não muda nada')
})

test('something that is not a backup changes nothing', async () => {
  const { directory, store } = await place()
  for (const bad of [null, {}, { app: 'outro', format: 1, files: {} }, { app: 'jarvis', format: 2, files: {} }, { app: 'jarvis', format: 1, files: { 'quiz.json': 'não é json' }, workspace: null }, { app: 'jarvis', format: 1, files: {}, workspace: 'quebrado' }]) {
    await assert.rejects(store.restore(bad, null))
  }
  assert.match(await fs.readFile(path.join(directory, 'assistant.json'), 'utf8'), /pagar/)
})

test('the automatic copy comes once a week and keeps the last five', async () => {
  const { store } = await place()
  const day = 86400000
  let now = Date.UTC(2026, 0, 1)
  const stamps = []
  assert.ok(await store.automatic('{}', now))
  const original = store.last
  store.last = async () => stamps.at(-1) ?? now
  assert.equal(await store.automatic('{}', now + 3 * day), null)
  for (let week = 1; week <= 7; week++) {
    stamps.push(now)
    now += 7 * day
    assert.ok(await store.automatic('{}', now))
  }
  store.last = original
  const left = await store.list()
  assert.equal(left.length, 5)
  assert.ok(left.at(-1).includes('2026-02-19'))
})

test('a copy made on purpose is never pruned', async () => {
  const { store } = await place()
  await store.save('{}', { now: Date.UTC(2020, 0, 1) })
  let now = Date.UTC(2026, 0, 1)
  for (let week = 0; week < 8; week++) { store.last = async () => 0; await store.automatic('{}', now); now += 7 * 86400000 }
  assert.equal((await store.list('jarvis-backup-')).length, 1)
})
