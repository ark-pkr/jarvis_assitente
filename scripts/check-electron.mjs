import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const testData = path.resolve('.ui-check.local/electron-runtime')
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: testData, JARVIS_DESKTOP_PORT: '18789', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
delete env.ELECTRON_RUN_AS_NODE
delete env.JARVIS_IMPORT_DATA
const executablePath = process.env.JARVIS_TEST_EXECUTABLE || electronPath
const args = [...(process.env.JARVIS_TEST_EXECUTABLE ? [] : [path.resolve('desktop-app')]), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
const application = await electron.launch({ executablePath, args, env, timeout: 45000 })
try {
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }) })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => console.error('Interface:', error.message))
  await page.waitForFunction(() => document.querySelector('.ignition, .status-text'), { timeout: 45000 })
  const origin = new URL(page.url()).origin
  assert.equal((await fetch(origin + '/health')).status, 401)
  const settings = await page.evaluate(() => window.jarvisDesktop.settings())
  assert.equal(settings.configured, true)
  const health = await page.evaluate(async () => (await fetch('/health')).json())
  assert.equal(health.stt, true); assert.equal(health.sttProvider, 'gemini')
  await page.evaluate(() => document.querySelector('button.ignition')?.click())
  await page.locator('.status-text').filter({ hasText: /OUVINDO/ }).waitFor({ timeout: 30000 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Aplicativo', exact: true }).click()
  assert.equal(await page.getByLabel('Chave Gemini', { exact: true }).inputValue(), '')
  await fs.mkdir('.ui-check.local', { recursive: true })
  await page.screenshot({ path: '.ui-check.local/electron-app.png' })
  const clip = (await fs.readFile('.ui-check.local/transcription-check.wav')).toString('base64')
  const audioResult = await page.evaluate(async (clip) => {
    const audio = Uint8Array.from(atob(clip), (character) => character.charCodeAt(0)).buffer
    const context = new AudioContext(); const decoded = await context.decodeAudioData(audio.slice(0)); await context.close()
    const transcript = await fetch('/stt', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: audio })
    if (!transcript.ok) throw new Error(`Transcrição: ${transcript.status}`)
    return { duration: decoded.duration, text: (await transcript.json()).text, bytes: audio.byteLength }
  }, clip)
  assert.ok(audioResult.bytes > 10000 && audioResult.duration > 1)
  assert.match(audioResult.text, /estudos|ajudar|pronto/i)
  console.log('Electron: interface, chave protegida, sessão privada, captura simulada, decodificação de voz e transcrição Gemini passaram.')
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.evaluate(() => window.jarvisDesktop.saveSettings({ model: 'gemini-3.5-flash' })),
  ])
  assert.equal((await page.evaluate(() => window.jarvisDesktop.settings())).configured, true)
  await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Computador', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir Calculadora', exact: true }).click()
  const approval = page.getByRole('dialog')
  await approval.waitFor({ timeout: 45000 })
  await approval.getByRole('button', { name: 'Autorizar esta ação', exact: true }).click()
  await page.locator('.log-jarvis').filter({ hasText: /calculadora/i }).last().waitFor({ timeout: 45000 })
  console.log('Electron: comando de abertura da Calculadora passou pelo fluxo real de confirmação.')
} finally { await application.close() }
