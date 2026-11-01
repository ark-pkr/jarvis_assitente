import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { fakeMicrophoneArgs, installSpeechMock, powerOn } from './voice-test-helpers.mjs'

const audioResponse = await fetch('http://localhost:8787/voice', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Olá. Agora minha voz está mais natural, com pausas suaves e sem interrupções acidentais.', voice: 'Charon' }), signal: AbortSignal.timeout(45000) })
assert.equal(audioResponse.status, 200)
const wav = Buffer.from(await audioResponse.arrayBuffer())
assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
assert.ok(wav.length > 10000)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: fakeMicrophoneArgs })
try {
  const page = await browser.newPage()
  await installSpeechMock(page)
  await page.goto('http://localhost:5173')
  await page.evaluate(async () => (await import('/src/workspace.ts')).useWorkspace.getState().setSettings({ naturalVoice: false }))
  await powerOn(page)
  await page.evaluate(async () => {
    window.__speechDuration = 600
    const { createSpeaker } = await import('/src/lib/tts.ts')
    const { useStore } = await import('/src/store.ts')
    useStore.setState({ phase: 'speaking' })
    window.__testSpeaker = createSpeaker()
    window.__testDrained = false
    window.__testSpeaker.push('Esta é a primeira parte da resposta, apresentada com calma para que você consiga acompanhar a explicação sem perder nenhum detalhe. Esta é a última parte da explicação e precisa terminar completamente, sem ser cancelada pelo eco do microfone. ')
    void window.__testSpeaker.end().then(() => { window.__testDrained = true })
  })
  await page.evaluate(() => { window.__testRecognition.emit('não precisa parar'); window.__testRecognition.emit('um ruído qualquer no ambiente') })
  assert.equal(await page.evaluate(async () => (await import('/src/store.ts')).useStore.getState().phase), 'speaking')
  await page.waitForFunction(() => window.__testDrained, undefined, { timeout: 6000 })
  assert.match((await page.evaluate(() => window.__spokenTexts)).join(' '), /última parte.*eco do microfone/)
  await page.evaluate(() => window.__testRecognition.emit('Jarvis, pare'))
  assert.equal(await page.evaluate(async () => (await import('/src/store.ts')).useStore.getState().phase), 'listening')
  console.log('PASS: voz neural WAV real, fila de fala completa, eco e ruído não cortam a resposta, comando explícito interrompe.')
} finally { await browser.close() }
