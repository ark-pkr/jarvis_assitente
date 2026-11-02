/**
 * A backup made in the real app has to bring everything back after the data is gone.
 *
 * Real panel, real files and a real page reload, on throwaway data, with no model
 * involved. npm run desktop:prepare first.
 */
import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'

await fs.mkdir('.ui-check.local', { recursive: true })
const profile = await fs.mkdtemp(path.resolve('.ui-check.local/backup-'))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: '18791', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
delete env.ELECTRON_RUN_AS_NODE
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env, timeout: 45000 })
try {
  await application.evaluate(({ dialog, clipboard }) => { dialog.showMessageBox = async () => ({ response: 0 }); globalThis.readClipboard = () => clipboard.readText() })
  const page = await application.firstWindow()
  const data = path.join(profile, 'dados'), folder = path.join(data, 'backups')
  const remember = async (text) => {
    await page.getByLabel('Preferências e memória').fill(text)
    await page.getByRole('button', { name: 'Salvar memória' }).click()
    await page.waitForTimeout(600)
  }
  const open = async (tab) => {
    await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
    await page.getByRole('button', { name: tab, exact: true }).click()
  }
  await fs.mkdir(data, { recursive: true })
  await fs.writeFile(path.join(data, 'learned.json'), '{"notes":[{"text":"estuda redes"}]}')
  await fs.mkdir(path.join(data, 'lectures'), { recursive: true })
  await fs.writeFile(path.join(data, 'lectures', 'aula-1.json'), '{"id":"aula-1","title":"Redes","started":1,"parts":[]}')

  await open('Memória')
  await remember('prefiro respostas curtas')
  await page.getByRole('button', { name: 'Fazer backup agora' }).click()
  await page.getByText(/Backup salvo em/).waitFor({ timeout: 10000 })
  const [name] = (await fs.readdir(folder)).filter((file) => file.endsWith('.json'))
  const text = await fs.readFile(path.join(folder, name), 'utf8')
  assert.match(text, /prefiro respostas curtas/)
  assert.match(text, /estuda redes/)
  assert.doesNotMatch(text, /encrypted|GEMINI/i)
  console.log('ok  backup salvo com memória, aprendizado e aula, sem chaves')

  await remember('estado perdido')
  await fs.rm(path.join(data, 'learned.json'))
  await fs.rm(path.join(data, 'lectures', 'aula-1.json'))
  await page.evaluate(() => { window.confirm = () => true })
  await page.getByLabel('Arquivo de backup').setInputFiles({ name: 'estranho.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"outro"}') })
  await page.getByText('Este arquivo não é um backup do JARVIS.').waitFor({ timeout: 10000 })
  console.log('ok  arquivo estranho recusado na tela')

  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.getByLabel('Arquivo de backup').setInputFiles(path.join(folder, name))])
  await open('Memória')
  assert.match(await page.getByLabel('Preferências e memória').inputValue(), /prefiro respostas curtas/)
  assert.match(await fs.readFile(path.join(data, 'learned.json'), 'utf8'), /estuda redes/)
  assert.match(await fs.readFile(path.join(data, 'lectures', 'aula-1.json'), 'utf8'), /Redes/)
  assert.ok((await fs.readdir(folder)).some((file) => file.startsWith('jarvis-antes-de-restaurar-')))
  console.log('ok  restaurar devolveu tudo e guardou o estado substituído')

  await page.getByRole('button', { name: 'Conexões', exact: true }).click()
  await page.getByRole('button', { name: 'Copiar diagnóstico' }).click()
  await page.getByText('Diagnóstico copiado.', { exact: false }).waitFor({ timeout: 10000 })
  const report = await application.evaluate(() => globalThis.readClipboard())
  assert.match(report, /JARVIS 1\.\d+\.\d+/)
  assert.match(report, /Avisos e erros do serviço/)
  assert.ok(!report.includes(profile.split(path.sep).slice(0, 3).join(path.sep)), 'pasta do usuário')
  if (env.GEMINI_API_KEY) assert.ok(!report.includes(env.GEMINI_API_KEY))
  console.log('ok  diagnóstico copiado sem pasta do usuário')
} finally {
  await application.close().catch(() => {})
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => {})
}
