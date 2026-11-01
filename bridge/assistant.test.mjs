import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AssistantMemory, handleAssistantRequest, searchMaterials, runRoutine, computerSummary, editorSelection, editorDiagnostics } from './assistant.mjs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { ProjectFiles } from './projects.mjs'
import { Readable } from 'node:stream'
import { getActiveWindow } from '../desktop/active-window.cjs'
const yes = async () => ({ approved: true })
async function fixture() {
  const area = path.resolve('.ui-check.local'); await fs.mkdir(area, { recursive: true })
  const base = await fs.mkdtemp(path.join(area, 'assistant-'))
  return { base, memory: new AssistantMemory(base) }
}
test('personal records persist, serialize competing writes, update and delete', async () => {
  const { base, memory } = await fixture()
  const entries = await Promise.all(Array.from({ length: 8 }, (_, i) => memory.save({ kind: 'projeto', title: `Sistema ${i}`, next: 'Criar testes' })))
  assert.equal((await new AssistantMemory(base).read()).entries.length, 8)
  const updated = await memory.save({ ...entries[0], status: 'executando', notes: 'Trabalhando na API' })
  assert.equal(updated.id, entries[0].id)
  assert.equal((await memory.read()).entries.length, 8)
  await memory.remove(updated.id)
  assert.equal((await memory.read()).entries.length, 7)
  await assert.rejects(memory.save({ ...updated }), /não encontrado/)
})
test('reminders require timezone, fire once under concurrent ticks and survive restarts', async () => {
  const { base, memory } = await fixture()
  assert.throws(() => memory.save({ kind: 'lembrete', title: 'SQL', due: '2026-10-29T19:00:00' }), /fuso/)
  await memory.save({ kind: 'lembrete', title: 'SQL', due: '2026-10-29T19:00:00-03:00' })
  await memory.save({ kind: 'lembrete', title: 'Já concluído', status: 'concluído', due: '2026-10-29T19:00:00-03:00' })
  const now = Date.parse('2026-10-29T22:01:00Z')
  await Promise.all([memory.tick(now), memory.tick(now)])
  assert.equal((await memory.read()).notifications.length, 1)
  await new AssistantMemory(base).tick(now + 100000)
  assert.equal((await memory.read()).notifications.length, 1)
})
test('context reminders only trigger once and never persist the foreground window', async () => {
  const { memory } = await fixture()
  assert.throws(() => memory.save({ kind: 'lembrete', title: 'Sem gatilho' }), /data e hora ou de um contexto/)
  const reminder = await memory.save({ kind: 'lembrete', title: 'Revisar documento', context: 'Word' })
  assert.deepEqual(await memory.triggerContext('Code - Projeto Atlas'), [])
  assert.deepEqual(await memory.triggerContext('Documento1 - Microsoft Word'), [{ id: reminder.id, title: 'Revisar documento' }])
  assert.deepEqual(await memory.triggerContext('Documento2 - Microsoft Word'), [])
  const saved = await memory.read()
  assert.equal(saved.notifications.length, 1)
  assert.equal(JSON.stringify(saved).includes('Documento1'), false)
})
test('context reminder endpoint accepts bounded local active-window signals', async () => {
  const { memory } = await fixture()
  await memory.save({ kind: 'lembrete', title: 'Continuar estudo', context: 'VS Code' })
  const req = Readable.from([JSON.stringify({ active: 'code VS Code - projeto de aula' })])
  req.method = 'POST'; req.url = '/assistant/context'
  req.headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' }
  const res = { writeHead(status) { this.statusCode = status }, end(body) { this.body = body; this.writableEnded = true } }
  await handleAssistantRequest(req, res, {}, memory)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).triggered[0].title, 'Continuar estudo')
})
test('foreground-window reader validates output and reports command failures', async () => {
  const mock = (_command, args, options, callback) => {
    assert.ok(args.includes('-NonInteractive'))
    assert.equal(options.windowsHide, true)
    callback(null, '{"process":"WINWORD","title":"Documento - Word"}')
  }
  assert.deepEqual(await getActiveWindow(mock), { process: 'WINWORD', title: 'Documento - Word' })
  await assert.rejects(getActiveWindow((_command, _args, _options, callback) => callback(new Error('acesso negado'))), /Não foi possível consultar a janela ativa/)
})
test('reminder alerts can be read and dismissed through the assistant endpoint', async () => {
  const { memory } = await fixture()
  await memory.mutate((state) => state.notifications.push({ id: 'notice-1', title: 'Revisar estudos', entryId: 'entry-1', time: Date.now() }))
  const response = () => ({
    writableEnded: false,
    writeHead(status) { this.statusCode = status },
    end(body) { this.body = body; this.writableEnded = true },
  })
  const get = response()
  await handleAssistantRequest({ method: 'GET', url: '/assistant/alerts' }, get, {}, memory)
  assert.equal(get.statusCode, 200)
  assert.equal(JSON.parse(get.body).notifications[0].title, 'Revisar estudos')
  const req = Readable.from([JSON.stringify({ action: 'ack', id: 'notice-1' })])
  req.method = 'POST'
  req.url = '/assistant'
  req.headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' }
  const ack = response()
  await handleAssistantRequest(req, ack, {}, memory)
  assert.equal(ack.statusCode, 200)
  assert.equal((await memory.read()).notifications.length, 0)
})
test('routine stops on partial failure and does not start timer or later apps', async () => {
  const { memory } = await fixture()
  const routine = await memory.save({ kind: 'rotina', title: 'Programar', steps: [{ appId: 'vscode' }, { appId: 'word' }, { appId: 'excel' }], minutes: 20 })
  const called = []
  const result = await runRoutine(routine.id, yes, undefined, { memory, apps: { open: async ({ appId }) => { called.push(appId); if (appId === 'word') throw new Error('Cancelado'); return { requested: true } } } })
  assert.equal(result.completed, false); assert.deepEqual(called, ['vscode', 'word'])
  assert.equal((await memory.read()).entries.length, 1)
  const success = await runRoutine(routine.id, yes, undefined, { memory, apps: { open: async () => ({ requested: true }) } })
  assert.equal(success.timerMinutes, 20)
  assert.equal((await memory.read()).entries.filter((entry) => entry.kind === 'lembrete').length, 1)
})
test('materials search returns references without reading secrets or leaving authorized root', async () => {
  const { base } = await fixture()
  const folder = path.join(base, 'project'); await fs.mkdir(folder)
  await fs.writeFile(path.join(folder, 'aula.md'), 'Primeira linha\nSQL seleciona dados\n')
  await fs.writeFile(path.join(folder, '.env.local'), 'SQL=secret')
  const files = new ProjectFiles(path.join(base, 'journal'))
  const root = await files.register(folder, yes)
  const results = await searchMaterials({ rootId: root.id, query: 'sql' }, files)
  assert.equal(results.matches.length, 1)
  assert.equal(results.matches[0].line, 2)
  assert.equal(results.matches[0].file, 'aula.md')
  await assert.rejects(searchMaterials({ rootId: root.id, query: 'sql', directory: '..' }, files), /fora da pasta/)
})
test('computer diagnostics return measured CPU, RAM and disk values', async () => {
  const summary = await computerSummary()
  assert.ok(summary.cpuPercent >= 0 && summary.cpuPercent <= 100)
  assert.ok(summary.memoryUsedPercent >= 0 && summary.memoryUsedPercent <= 100)
  assert.ok(summary.diskTotalGB > 0 && summary.diskFreeGB >= 0)
})
test('VS Code command shares selected code only with approval and backend enforces scope and expiry', async () => {
  const { base } = await fixture()
  const snapshotDirectory = path.join(base, '.jarvis-data')
  const project = path.join(base, 'code'); await fs.mkdir(project)
  const filename = path.join(project, 'main.ts'); await fs.writeFile(filename, 'const x = 1;')
  const commands = {}; let allow = false
  const source = await fs.readFile('integrations/vscode/extension.cjs', 'utf8')
  const require = createRequire(import.meta.url)
  const vscode = {
    commands: { registerCommand: (name, callback) => { commands[name] = callback; return {} } },
    workspace: { workspaceFolders: [{ uri: { fsPath: project } }], getConfiguration: () => ({ get: () => snapshotDirectory }) },
    languages: { getDiagnostics: () => [] },
    window: { activeTextEditor: { selection: { isEmpty: false, start: { line: 0 }, end: { line: 0 } }, document: { uri: { scheme: 'file', fsPath: filename }, languageId: 'typescript', isDirty: false, getText: () => 'const x = 1;' } }, showInformationMessage: async () => allow ? 'Compartilhar' : undefined, showErrorMessage: (text) => { throw new Error(text) } },
  }
  const exports = {}
  vm.runInNewContext(source, { require: (name) => name === 'vscode' ? vscode : require(name), exports, Date })
  exports.activate({ subscriptions: [] })
  await commands['jarvis.shareSelection']()
  await assert.rejects(fs.stat(path.join(snapshotDirectory, 'editor.json')), { code: 'ENOENT' })
  allow = true; await commands['jarvis.shareSelection']()
  const files = new ProjectFiles(path.join(base, 'journal'))
  await assert.rejects(editorSelection(files, snapshotDirectory), /Autorize a pasta/)
  await files.register(project, yes)
  const result = await editorSelection(files, snapshotDirectory)
  assert.equal(result.text, 'const x = 1;'); assert.equal(result.startLine, 1)
  const saved = JSON.parse(await fs.readFile(path.join(snapshotDirectory, 'editor.json'), 'utf8'))
  await fs.writeFile(path.join(snapshotDirectory, 'editor.json'), JSON.stringify({ ...saved, time: Date.now() - 16 * 60000 }))
  await assert.rejects(editorSelection(files, snapshotDirectory), /expirada/)
})
test('VS Code diagnostics require consent, are bounded, expire, and stay inside authorized project roots', async () => {
  const { base } = await fixture()
  const snapshotDirectory = path.join(base, '.jarvis-data')
  const project = path.join(base, 'diagnostics-project'); await fs.mkdir(project)
  const filename = path.join(project, 'main.ts'); await fs.writeFile(filename, 'const value: number = "wrong"')
  const outside = path.join(base, 'outside.ts'); await fs.writeFile(outside, 'const outside = true')
  let command; let allow = false; const confirmations = []
  const diagnostic = (file, message) => [{
    range: { start: { line: 2, character: 4 }, end: { line: 2, character: 12 } },
    message, severity: 0, source: 'ts', code: 2322,
  }]
  const vscode = {
    commands: { registerCommand: (name, callback) => { if (name === 'jarvis.shareDiagnostics') command = callback; return {} } },
    workspace: { workspaceFolders: [{ uri: { fsPath: project } }], getConfiguration: () => ({ get: () => snapshotDirectory }) },
    languages: { getDiagnostics: () => [
      [{ scheme: 'file', fsPath: filename }, diagnostic(filename, 'Type "string" is not assignable to type "number".')],
      [{ scheme: 'file', fsPath: outside }, diagnostic(outside, 'Should not be included')],
      [{ scheme: 'untitled', fsPath: 'Untitled-1' }, diagnostic('', 'Ignore non-file documents')],
    ] },
    window: {
      showInformationMessage: async (message) => { confirmations.push(message); return allow ? 'Compartilhar diagnósticos' : undefined },
      showErrorMessage: (text) => { throw new Error(text) },
    },
  }
  const exports = {}
  const require = createRequire(import.meta.url)
  vm.runInNewContext(await fs.readFile('integrations/vscode/extension.cjs', 'utf8'), {
    require: (name) => name === 'vscode' ? vscode : require(name), exports, Date,
  })
  exports.activate({ subscriptions: [] })
  await command()
  await assert.rejects(fs.stat(path.join(snapshotDirectory, 'editor-diagnostics.json')), { code: 'ENOENT' })
  allow = true
  await command()
  assert.match(confirmations.find((message) => message.includes('Compartilhar até')), /Compartilhar até 1 diagnósticos/)
  const files = new ProjectFiles(path.join(base, 'journal'))
  await assert.rejects(editorDiagnostics(files, snapshotDirectory), /Autorize a pasta/)
  await files.register(project, yes)
  const result = await editorDiagnostics(files, snapshotDirectory)
  assert.equal(result.total, 1)
  assert.equal(result.diagnostics[0].file, 'main.ts')
  assert.equal(result.diagnostics[0].severity, 'error')
  assert.equal(result.diagnostics[0].line, 3)
  const snapshotFile = path.join(snapshotDirectory, 'editor-diagnostics.json')
  const snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8'))
  await fs.writeFile(snapshotFile, JSON.stringify({
    ...snapshot, diagnostics: [{ ...snapshot.diagnostics[0], path: outside }],
  }))
  await assert.rejects(editorDiagnostics(files, snapshotDirectory), /não autorizado|Autorize a pasta/)
  await fs.writeFile(snapshotFile, JSON.stringify({ ...snapshot, time: Date.now() - 16 * 60000 }))
  await assert.rejects(editorDiagnostics(files, snapshotDirectory), /expirados/)
})
