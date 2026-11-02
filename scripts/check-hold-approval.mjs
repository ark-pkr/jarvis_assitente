/**
 * A click on Authorize, the kind that lands there by accident, must not authorize.
 *
 * Real pointer events on the real card in the prepared app, reached through a real
 * request to the model, on throwaway data. npm run desktop:prepare first.
 */
import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'

await fs.mkdir('.ui-check.local', { recursive: true })
const profile = await fs.mkdtemp(path.resolve('.ui-check.local/hold-'))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: '18789', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
delete env.ELECTRON_RUN_AS_NODE
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env, timeout: 45000 })
try {
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  const page = await application.firstWindow()
  const ask = 'Salve um lembrete para amanhã às dez horas da manhã: comprar pão.'
  await page.evaluate((text) => {
    const id = crypto.randomUUID()
    localStorage.setItem('jarvis.workspace.v1', JSON.stringify({ active: id, settings: { greeting: false, bootSeen: true, experienceVersion: 9 }, sessions: [{ id, title: 'Teste', updated: Date.now(), turns: [{ id: 'seed', role: 'user', text }] }] }))
  }, ask)
  await page.reload()
  const replies = []
  page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
    try { const frame = JSON.parse(String(payload)); if (frame.type === 'reply' && 'approved' in frame) replies.push(frame.approved) } catch { /* Not ours. */ }
  }))
  await page.getByRole('button', { name: /INICIAR JARVIS/ }).click()
  await page.waitForFunction(() => /OUVINDO/.test(document.querySelector('.status-text')?.textContent ?? ''), null, { timeout: 30000 })
  await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Histórico', exact: true }).click()
  await page.locator('.history-messages article').first().getByRole('button', { name: 'Repetir pedido' }).click()

  const card = page.getByRole('dialog', { name: 'Confirmar ação do JARVIS' })
  await card.waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  const button = page.getByRole('button', { name: 'Autorizar esta ação', exact: true })
  const box = await button.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2

  for (let click = 0; click < 3; click++) { await page.mouse.click(x, y); await page.waitForTimeout(250) }
  await page.mouse.dblclick(x, y)
  await page.waitForTimeout(1200)
  assert.deepEqual(replies, [], 'um clique não autoriza')
  assert.equal(await card.isVisible(), true)
  console.log('ok  três cliques e um clique duplo não autorizaram')

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(350)
  await page.mouse.move(x, y - 200)
  await page.mouse.up()
  await page.waitForTimeout(900)
  assert.deepEqual(replies, [], 'soltar antes da hora não autoriza')
  console.log('ok  segurar e sair antes da hora não autorizou')

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(950)
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(replies, [true], 'segurar autoriza')
  assert.equal(await card.isVisible(), false)
  console.log('ok  segurar autorizou, uma vez só')
} finally {
  await application.close().catch(() => {})
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => {})
}
