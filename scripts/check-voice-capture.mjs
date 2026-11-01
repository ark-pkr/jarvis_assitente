import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import path from 'node:path'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
const profile = await fs.mkdtemp(path.resolve('.ui-check.local/capture-'))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: '18791', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
delete env.ELECTRON_RUN_AS_NODE
const fixture = process.env.JARVIS_CAPTURE_FIXTURE || '.ui-check.local/word-command.wav'
const kind = process.env.JARVIS_CAPTURE_KIND || (process.env.JARVIS_CAPTURE_NEGATIVE ? 'negative' : 'word')
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(fixture)}%noloop`], env, timeout: 45000 })
async function timeout(promise) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A captura não produziu o resultado esperado em 45 s.')), 45000) })]) } finally { clearTimeout(timer) } }
try {
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  const page = await application.firstWindow()
  const asks = []; const tools = []
  let onSent; let onDone
  const sent = new Promise((resolve) => { onSent = resolve })
  const done = new Promise((resolve) => { onDone = resolve })
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => { try { const frame = JSON.parse(String(payload)); if (frame.type === 'ask') { asks.push(frame.text); onSent(frame.text) } } catch {} })
    socket.on('framereceived', ({ payload }) => { try { const frame = JSON.parse(String(payload)); if (frame.type === 'tool') tools.push(frame.name); if (['done', 'error'].includes(frame.type)) onDone(frame) } catch {} })
  })
  await page.getByRole('button', { name: /INICIAR JARVIS/ }).click()
  const text = await timeout(sent)
  assert.match(text, kind === 'question' ? /que horas s[aã]o/i : /abr\w*.*word.*instalado/i)
  assert.equal(await page.getByRole('dialog', { name: 'Conferir pedido por voz' }).count(), 0)
  if (kind === 'word') {
    const approval = page.getByRole('dialog', { name: 'Confirmar ação do JARVIS' })
    await approval.waitFor({ timeout: 45000 })
    await approval.getByRole('button', { name: 'Cancelar', exact: true }).click()
    console.log('“Abra o Word instalado”: transcrição enviada diretamente; a confirmação permanece apenas na abertura real do aplicativo.')
  } else {
    if (kind === 'negative') assert.match(text, /\bn[aã]o\b/i)
    const result = await timeout(done)
    assert.equal(result.type, 'done')
    assert.ok(result.text.length > 0)
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(tools.some((name) => /desktop_open|word_new|word_append/.test(name)), false)
    if (kind === 'question') assert.ok(tools.some((name) => name.includes('local_time')), 'Hora deve vir do relógio real.')
    await page.screenshot({ path: `.ui-check.local/voice-${kind}.png` })
    console.log(`${kind}: fala reconhecida e respondida diretamente, sem confirmação desnecessária ou abertura de aplicativos.`)
  }
  assert.equal(asks.length, 1)
} finally { await application.close() }
