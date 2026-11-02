/**
 * A confirmation answered through the whole real path: the desktop app, a recording
 * in place of the microphone, the voice gate, the transcription and the model.
 *
 * The request is to save a reminder, in throwaway test data, so a "yes" that works
 * changes nothing on this computer. Uses the Gemini key from .env.local.
 *
 * npm run desktop:prepare first: this drives the prepared app, not the source.
 */
import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'

const ASK = 'Jarvis, salve um lembrete para amanhã às dez horas da manhã: comprar pão.'
/** Long enough for the model and the question, then the answer again and again. */
const WAIT = '16.0'
const answers = (process.argv.slice(2).length ? process.argv.slice(2) : ['Sim', 'Não', 'Pode seguir']).map((said) => ({ said, approved: !/n[aã]o/i.test(said) }))

await fs.mkdir('.ui-check.local', { recursive: true })
let failed = 0
for (const { said, approved } of answers) {
  const profile = await fs.mkdtemp(path.resolve('.ui-check.local/approval-'))
  const fixture = path.join(profile, 'mic.wav')
  const parts = path.join(profile, 'parts.json')
  await fs.writeFile(parts, JSON.stringify(['12.0', ASK, WAIT, said, '7.0', said, '7.0', said, '7.0', said, '12.0']))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/make-voice-fixture.ps1'), '-Out', fixture, '-PartsFile', parts])
  const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: '18795', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
  delete env.ELECTRON_RUN_AS_NODE
  const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}%noloop`], env, timeout: 45000 })
  try {
    await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
    const page = await application.firstWindow()
    // These windows open on the real desktop, so a hand on the mouse can reach them.
    await page.addInitScript(() => addEventListener('click', (event) => { window.__click = { trusted: event.isTrusted, detail: event.detail, x: event.clientX, y: event.clientY, target: event.target?.textContent?.slice(0, 40) } }, true))
    await page.reload()
    let onReply
    const replied = new Promise((resolve) => { onReply = resolve })
    const asks = []
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload))
        if (frame.type === 'ask') asks.push(frame.text)
        if (frame.type === 'reply' && 'approved' in frame) onReply(frame.approved)
      } catch { /* Not ours. */ }
    }))
    await page.getByRole('button', { name: /INICIAR JARVIS/ }).click()
    const card = page.getByRole('dialog', { name: 'Confirmar ação do JARVIS' })
    await card.waitFor({ timeout: 45000 }).catch(async (error) => {
      console.log('  o cartão não apareceu. Pedido:', asks, 'voz:', await page.evaluate(() => JSON.stringify(window.__voice)), 'tela:', (await page.locator('.log, .error').allTextContents()).join(' | '))
      throw error
    })
    const shownAt = Date.now()
    const outcome = await Promise.race([replied, new Promise((resolve) => setTimeout(() => resolve('sem resposta'), 45000))])
    const heard = await page.evaluate(() => ({ heard: window.__voice?.heard, dropped: window.__voice?.dropped }))
    // An answer nobody spoke came from the card, not from the voice path under test.
    const clicked = !heard.heard?.toLowerCase().includes(said.toLowerCase())
    if (clicked) console.log('  CLIQUE FORA DO TESTE:', await page.evaluate(() => JSON.stringify(window.__click)))
    console.log(`“${said}”: ${outcome === approved ? 'ok' : `FALHOU (${outcome})`} em ${((Date.now() - shownAt) / 1000).toFixed(1)} s, pedido: ${asks.join(' | ')}, último ouvido: ${JSON.stringify(heard)}`)
    if (outcome !== approved || clicked) failed++
    assert.equal(asks.length, 1, 'a resposta não pode virar um pedido novo')
    if (approved) {
      await page.waitForTimeout(4000)
      const saved = JSON.parse(await fs.readFile(path.join(profile, 'dados', 'assistant.json'), 'utf8').catch(() => '{"entries":[]}'))
      console.log(`  salvo de verdade: ${saved.entries.some((entry) => /p[aã]o/i.test(entry.title)) ? 'sim' : 'NÃO'}`)
    }
  } finally {
    await application.close().catch(() => {})
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => {})
  }
}
process.exitCode = failed ? 1 : 0
