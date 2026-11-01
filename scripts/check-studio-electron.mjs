import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import net from 'node:net'
import { ProjectFiles } from '../bridge/projects.mjs'
const area = path.resolve('.ui-check.local')
const fixture = (await fs.readdir(area)).find((entry) => entry.startsWith('lessons-'))
assert.ok(fixture, 'Execute test:lessons para criar o PDF de teste.')
const folder = path.join(area, fixture, 'aulas')
const profile = await fs.mkdtemp(path.join(area, 'native-studio-'))
const files = new ProjectFiles(path.join(profile, 'dados', 'projects'))
await files.register(folder, async () => ({ approved: true }))
const probe = net.createServer(); await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise((resolve) => probe.close(resolve))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: String(port) }
delete env.ELECTRON_RUN_AS_NODE; delete env.JARVIS_IMPORT_DATA; delete env.JARVIS_IMPORT_ENV; delete env.GEMINI_API_KEY
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app')], env, timeout: 45000 })
try {
  console.log('Electron iniciado para verificar PDF.')
  application.process().stderr.on('data', (text) => console.error(String(text).slice(0, 1600)))
  await application.evaluate(({ dialog }) => { dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message) } })
  const page = await application.firstWindow({ timeout: 30000 })
  console.log('Janela nativa disponível.')
  await page.getByRole('button', { name: /INICIAR JARVIS/ }).waitFor({ timeout: 45000 })
  await page.getByRole('button', { name: /02 Professor/ }).click()
  await page.getByRole('button', { name: 'Escolher material ↗', exact: true }).click()
  await page.getByLabel('Pasta do PDF', { exact: true }).fill(folder)
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/lesson-pdf?')),
    page.getByLabel('Arquivo PDF da aula', { exact: true }).fill('aula.pdf'),
  ])
  await page.getByLabel('Fechar ajustes', { exact: true }).click()
  await page.getByTitle('PDF da aula', { exact: true }).waitFor()
  assert.ok([200, 206].includes(response.status()), `PDF HTTP ${response.status()}`)
  assert.match(response.headers()['content-type'], /application\/pdf/)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: '.ui-check.local/native-professor-pdf.png' })
  await page.getByRole('button', { name: /03 Desenvolvedor/ }).click()
  await page.getByLabel('Rascunho de código').fill('print("Aprendendo com o JARVIS")')
  assert.equal(await page.getByRole('button', { name: 'Aplicar no projeto', exact: true }).isDisabled(), true)
  await page.getByLabel('Projeto do desenvolvedor').selectOption((await files.state()).roots[0].id)
  assert.equal(await page.getByRole('button', { name: 'Aplicar no projeto', exact: true }).isEnabled(), true)
  console.log('Electron: PDF autorizado carregado, modos e validação do projeto disponíveis sem expor outros arquivos.')
} finally { await application.close() }
