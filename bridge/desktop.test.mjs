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
test('an app opens at once, code at a line in an open folder, and never outside it', async () => {
  const { apps, calls, files, directory, executable } = await fixture()
  apps.list = async () => [{ id: 'vscode', name: 'Visual Studio Code', executable }]
  const project = path.join(directory, 'project'); await fs.mkdir(project)
  await fs.writeFile(path.join(project, 'main.js'), 'const a=1;')
  const root = await files.register(project, no)
  const result = await apps.open({ appId: 'vscode', rootId: root.id, file: 'main.js', line: 12 })
  assert.equal(result.requested, true)
  assert.deepEqual(calls[0].args, ['--reuse-window', '--goto', `${path.join(project, 'main.js')}:12:1`])
  await assert.rejects(() => apps.open({ appId: 'vscode', rootId: root.id, file: '../Editor.exe' }), /fora da pasta/)
  await assert.rejects(() => apps.open({ appId: 'vscode', file: 'main.js' }), /Autorize/)
})
test('everything in the Start menu opens by name through Explorer, except shells and system tools', async () => {
  const { directory } = await fixture()
  const calls = []
  const apps = new DesktopApps({
    storage: path.join(directory, 'none.json'),
    launch: async (file, args) => { calls.push({ file, args }); return { brokered: true } },
    readStartApps: async () => [
      { name: 'Spotify', appId: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' },
      { name: 'Google Chrome', appId: 'Chrome' },
      { name: 'Prompt de Comando', appId: '{1AC14E77}\\cmd.exe' },
      { name: 'Windows PowerShell', appId: '{1AC14E77}\\WindowsPowerShell\\v1.0\\powershell.exe' },
      { name: 'Terminal', appId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App' },
      { name: 'Editor do Registro', appId: 'regedit' },
      { name: 'Desinstalar Algo', appId: 'Algo.Uninstall' },
      { name: 'Estranho', appId: 'x" & calc' },
    ],
  })
  const names = (await apps.find()).map((app) => app.name)
  assert.ok(names.includes('Spotify') && names.includes('Google Chrome'))
  for (const hidden of ['Prompt de Comando', 'Windows PowerShell', 'Terminal', 'Editor do Registro', 'Desinstalar Algo', 'Estranho']) assert.ok(!names.includes(hidden), hidden)
  assert.deepEqual((await apps.find('spoti')).map((app) => app.name), ['Spotify'])
  const spotify = (await apps.find('spotify'))[0]
  const opened = await apps.open({ appId: spotify.id })
  assert.equal(opened.app, 'Spotify')
  assert.match(calls[0].file, /explorer\.exe$/i)
  assert.deepEqual(calls[0].args, ['shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'])
  await assert.rejects(() => apps.open({ appId: 'start:{1AC14E77}\\cmd.exe' }), /não encontrado/)
  await assert.rejects(() => apps.open({ appId: spotify.id, file: 'x.txt' }), /abre sozinho/)
})
