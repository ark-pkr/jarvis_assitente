import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DesktopApps, validateExecutable } from './desktop.mjs'
import { ProjectFiles } from './projects.mjs'
const yes = async () => ({ approved: true })
const no = async () => ({ approved: false })
async function fixture() {
  await fs.mkdir('.ui-check.local', { recursive: true })
  const directory = await fs.mkdtemp(path.resolve('.ui-check.local/desktop-'))
  const executable = path.join(directory, 'Editor.exe')
  await fs.writeFile(executable, 'test-only; never execute')
  const files = new ProjectFiles(path.join(directory, 'journal'))
  const calls = []
  const apps = new DesktopApps({ storage: path.join(directory, 'apps.json'), files, launch: async (file, args) => { calls.push({ file, args }); return { pid: 123 } } })
  return { apps, calls, files, directory, executable }
}
test('application registration requires approval and excludes scripts and shells', async () => {
  const { apps, executable, directory } = await fixture()
  await assert.rejects(() => apps.register('Editor', executable, no), /Cancelado/)
  assert.equal((await apps.custom()).length, 0)
  const registered = await apps.register('Editor', executable, yes)
  assert.equal((await apps.custom())[0].id, registered.id)
  for (const file of ['script.cmd', 'powershell.exe', 'node.exe']) await assert.rejects(() => validateExecutable(path.join(directory, file)), /aplicativo/)
})
test('launch requires approval, opens authorized code at line and rejects traversal', async () => {
  const { apps, calls, files, directory, executable } = await fixture()
  apps.list = async () => [{ id: 'vscode', name: 'Visual Studio Code', executable }]
  const project = path.join(directory, 'project'); await fs.mkdir(project)
  await fs.writeFile(path.join(project, 'main.js'), 'const a=1;')
  const root = await files.register(project, yes)
  await assert.rejects(() => apps.open({ appId: 'vscode', rootId: root.id, file: 'main.js' }, no), /cancelada/)
  assert.equal(calls.length, 0)
  const result = await apps.open({ appId: 'vscode', rootId: root.id, file: 'main.js', line: 12 }, yes)
  assert.equal(result.requested, true)
  assert.deepEqual(calls[0].args, ['--reuse-window', '--goto', `${path.join(project, 'main.js')}:12:1`])
  await assert.rejects(() => apps.open({ appId: 'vscode', rootId: root.id, file: '../Editor.exe' }, yes), /fora da pasta/)
  await assert.rejects(() => apps.open({ appId: 'vscode', file: 'main.js' }, yes), /Autorize/)
})
test('changed executable is not launched after confirmation', async () => {
  const { apps, calls, executable } = await fixture()
  apps.list = async () => [{ id: 'vscode', name: 'VS Code', executable }]
  await assert.rejects(() => apps.open({ appId: 'vscode' }, async () => { await fs.appendFile(executable, 'changed'); return { approved: true } }), /alterado/)
  assert.equal(calls.length, 0)
})
