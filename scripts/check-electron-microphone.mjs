import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import assert from 'node:assert/strict'
const directory = await fs.mkdtemp(path.resolve('.ui-check.local/first-run-'))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: directory, JARVIS_DESKTOP_PORT: '18790' }
delete env.ELECTRON_RUN_AS_NODE; delete env.JARVIS_IMPORT_ENV; delete env.JARVIS_IMPORT_DATA; delete env.GEMINI_API_KEY
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--use-fake-ui-for-media-stream'], env, timeout: 45000 })
try {
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  const page = await application.firstWindow()
  await page.waitForFunction(() => document.querySelector('.workspace-open'), { timeout: 45000 })
  assert.equal((await page.evaluate(() => window.jarvisDesktop.settings())).configured, false)
  await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Aplicativo', exact: true }).click()
  await page.getByText('configure sua chave para começar', { exact: false }).waitFor()
  const microphone = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = stream.getAudioTracks()[0]
    const result = { live: track.readyState === 'live', channels: track.getSettings().channelCount }
    stream.getTracks().forEach((item) => item.stop()); return result
  })
  assert.equal(microphone.live, true)
  console.log('Electron: primeira abertura sem chave e acesso ao microfone físico passaram. Nenhuma gravação foi enviada à IA neste teste.')
} finally { await application.close() }
