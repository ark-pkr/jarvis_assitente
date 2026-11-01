import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

/**
 * Starting alone, the global shortcut, the floating orb and the screen capture,
 * in the real app. Needs `npm run desktop:prepare`. Uses no API: the key is fake
 * and the microphone is silent. The capture reads the screen but is only
 * measured here; it is never written anywhere.
 */
const testData = path.resolve('.ui-check.local/presence-runtime')
await fs.rm(testData, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 })
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: testData, JARVIS_DESKTOP_PORT: '18791' }
for (const name of ['ELECTRON_RUN_AS_NODE', 'JARVIS_IMPORT_DATA', 'JARVIS_IMPORT_ENV', 'GEMINI_API_KEY']) delete env[name]
const silence = path.resolve('.ui-check.local/silence.wav')
await fs.mkdir(path.dirname(silence), { recursive: true })
const header = Buffer.alloc(44)
header.write('RIFF', 0); header.writeUInt32LE(36 + 96000, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28)
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(96000, 40)
await fs.writeFile(silence, Buffer.concat([header, Buffer.alloc(96000)]))

const launch = () => electron.launch({
  executablePath: electronPath,
  args: [path.resolve('desktop-app'), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${silence}`, '--mute-audio'],
  env, timeout: 45000,
})
const windows = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((win) => ({ url: win.webContents.getURL(), visible: win.isVisible(), focused: win.isFocused() })))
const mainOf = (list) => list.find((win) => !win.url.includes('mini=1'))
const miniOf = (list) => list.find((win) => win.url.includes('mini=1'))
const onMain = (app, code) => app.evaluate(({ BrowserWindow }, source) => {
  const win = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().includes('mini=1'))
  return new Function('win', source)(win)
}, code)
const waitFor = async (check, label) => {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 150)) }
  assert.fail(`não aconteceu: ${label}`)
}
const step = (label) => console.log(`ok  ${label}`)

let app = await launch()
try {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }) })
  let page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('Interface:', error.message))
  await page.getByRole('button', { name: /INICIAR JARVIS/ }).waitFor({ timeout: 30000 })
  const first = await page.evaluate(() => window.jarvisDesktop.settings())
  assert.equal(first.autoActivate, false)
  assert.equal(first.clapToStart, false)
  assert.equal(first.miniOrb, true)
  assert.equal(first.hotkeyError, '', first.hotkeyError)
  step(`padrões seguros; atalho ${first.hotkey} registrado`)
  await page.waitForTimeout(1500)
  assert.equal(await page.locator('.ignition').count(), 1)
  step('sem a opção, ele não liga sozinho')

  // Saving reloads the window, so wait for the reload it causes.
  await page.evaluate(() => window.jarvisDesktop.saveSettings({ apiKey: 'chave-falsa-sem-acesso-nenhum', autoActivate: true, wakeKey: 'chave-picovoice-falsa-para-teste-0000' }))
  await app.close()

  app = await launch()
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => { throw new Error('o microfone não deveria perguntar') } })
  page = await app.firstWindow()
  const t0 = Date.now()
  await page.locator('.status-text').filter({ hasText: /^(OUVINDO|RESPONDENDO)$/ }).waitFor({ timeout: 30000 })
  step(`ativou sozinho em ${Date.now() - t0} ms, sem clique e sem diálogo`)

  await waitFor(() => page.locator('[role=alert]').filter({ hasText: /Picovoice/ }).count(), 'aviso da chave Picovoice inválida')
  step('chave Picovoice inválida: avisa e continua; modelo e worker carregaram até validar a chave')
  await waitFor(() => page.locator('.status-text').filter({ hasText: /^OUVINDO$/ }).count(), 'continuar ouvindo depois da falha')
  assert.equal(await page.evaluate(() => window.__voice?.running ?? true), true)
  step('a voz continua de pé depois da falha')

  await page.keyboard.press('Escape')
  await page.locator('.status-text').filter({ hasText: /EM ESPERA/ }).waitFor()
  await onMain(app, `win.webContents.send('jarvis:hotkey')`)
  await page.locator('.status-text').filter({ hasText: /^OUVINDO$/ }).waitFor()
  step('o atalho global reativa o assistente em espera')

  await onMain(app, 'win.hide()')
  await waitFor(async () => miniOf(await windows(app))?.visible, 'mini esfera visível')
  assert.equal(mainOf(await windows(app)).visible, false)
  step('janela oculta: a mini esfera aparece')
  const mini = app.windows().find((item) => item.url().includes('mini=1'))
  await waitFor(() => mini.locator('.mini-label').filter({ hasText: /Ouvindo/ }).count(), 'mini acompanhando o estado')
  step('a mini esfera acompanha o estado da janela principal')
  assert.equal(await mini.locator('.ignition').count(), 0)
  assert.equal(await mini.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)')
  step('a mini esfera é transparente e não carrega o aplicativo')

  await page.evaluate(() => window.jarvisDesktop.requestAttention())
  await waitFor(async () => mainOf(await windows(app)).visible, 'confirmação trazendo a janela')
  await page.evaluate(() => window.jarvisDesktop.releaseAttention())
  await waitFor(async () => !mainOf(await windows(app)).visible, 'janela voltando para a bandeja')
  step('uma confirmação traz a janela e devolve como estava')

  await mini.locator('.mini-orb').click()
  await waitFor(async () => mainOf(await windows(app)).visible, 'clique na mini abrindo a janela')
  step('clicar na mini esfera abre a janela principal')

  const shot = await page.evaluate(async () => {
    const { data, mimeType } = await window.jarvisDesktop.captureScreen()
    return { mimeType, size: data.length, jpeg: data.startsWith('/9j/') }
  })
  assert.equal(shot.mimeType, 'image/jpeg')
  assert.ok(shot.jpeg && shot.size > 2000, JSON.stringify(shot))
  await waitFor(async () => mainOf(await windows(app)).visible, 'janela voltando depois da captura')
  step(`captura da tela: ${Math.round(shot.size * 3 / 4 / 1024)} KB, e a janela volta depois`)

  const refused = await page.evaluate(async () => {
    try { await window.jarvisDesktop.saveSettings({ hotkey: 'isto não é um atalho' }); return false } catch { return true }
  })
  assert.equal(refused, true)
  step('atalho inválido é recusado')
  console.log('Tudo certo.')
} finally {
  await app.close().catch(() => {})
}
