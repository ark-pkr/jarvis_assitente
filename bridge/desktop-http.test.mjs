import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopAuthorized, serveDesktop } from './desktop-http.mjs'
import { handleTranscription, transcribeAudio, transcribeAudioDetailed } from './transcribe.mjs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
test('desktop service requires its private session cookie', () => {
  const req = (cookie) => ({ headers: { cookie } })
  assert.equal(desktopAuthorized(req(''), 'secret'), false)
  assert.equal(desktopAuthorized(req('jarvis_session=wrong'), 'secret'), false)
  assert.equal(desktopAuthorized(req('jarvis_session=éééééé'), 'secret'), false)
  assert.equal(desktopAuthorized(req('other=x; jarvis_session=secret'), 'secret'), true)
})
test('packaged static server serves the interface but refuses outside files and unknown types', async () => {
  await fs.mkdir('.ui-check.local', { recursive: true })
  const dir = await fs.mkdtemp(path.resolve('.ui-check.local/desktop-'))
  await fs.writeFile(path.join(dir, 'index.html'), '<h1>JARVIS</h1>')
  await fs.writeFile(path.join(dir, 'eagle_params.pv'), Buffer.from([1, 2, 3]))
  const response = { writeHead: (_status, headers) => { response.headers = headers }, end: (body) => { response.body = body } }
  assert.equal(await serveDesktop({ method: 'GET', url: '/' }, response, dir), true)
  assert.match(response.body.toString(), /JARVIS/)
  assert.equal(await serveDesktop({ method: 'GET', url: '/eagle_params.pv' }, response, dir), true)
  assert.equal(response.headers['content-type'], 'application/octet-stream')
  assert.equal(await serveDesktop({ method: 'GET', url: '/%2e%2e%2fpackage.json' }, response, dir), false)
  assert.equal(await serveDesktop({ method: 'GET', url: '/secret.key' }, response, dir), false)
})
test('Gemini transcription accepts bounded audio and sends transcription-only instruction', async () => {
  const calls = []
  const client = { models: { generateContent: async (request) => { calls.push(request); return { text: JSON.stringify({ speech: true, clear: true, text: 'Oi Jarvis, abra a calculadora.' }) } } } }
  assert.equal(await transcribeAudio(Buffer.alloc(100), 'audio/wav', { client }), '')
  assert.equal(calls.length, 0)
  const text = await transcribeAudio(Buffer.alloc(2000), 'audio/webm;codecs=opus', { client })
  assert.match(text, /calculadora/)
  assert.equal(calls[0].contents[0].parts[1].inlineData.mimeType, 'audio/webm')
  assert.match(calls[0].contents[0].parts[0].text, /Não responda/)
  await assert.rejects(transcribeAudio(Buffer.alloc(2000), 'text/plain', { client }), /Formato/)
  await assert.rejects(transcribeAudio(Buffer.alloc(9 * 1024 * 1024), 'audio/wav', { client }), /grande/)
})
test('unclear audio, silence and malformed transcription never become commands', async () => {
  for (const text of ['Abra o Word', JSON.stringify({ speech: false, clear: true, text: 'Abra o Word' }), JSON.stringify({ speech: true, clear: false, text: 'Abra o Word' })]) {
    const client = { models: { generateContent: async () => ({ text }) } }
    assert.equal(await transcribeAudio(Buffer.alloc(2000), 'audio/wav', { client }), '')
  }
})
test('a single unclear span is returned only as a clarification prompt, never as a command', async () => {
  for (const clear of [false, true]) {
    const client = { models: { generateContent: async () => ({ text: JSON.stringify({
      speech: true, clear, text: 'Abra a pasta [trecho incerto] no explorador',
    }) }) } }
    assert.equal(await transcribeAudio(Buffer.alloc(2000), 'audio/wav', { client }), '')
    assert.deepEqual(await transcribeAudioDetailed(Buffer.alloc(2000), 'audio/wav', { client }), {
      text: '', clarification: 'Abra a pasta [trecho incerto] no explorador',
    })
  }

  const req = Readable.from([Buffer.alloc(2000)])
  req.headers = { 'content-type': 'audio/wav' }
  const res = {
    writableEnded: false, destroyed: false, on() {},
    writeHead(status) { this.statusCode = status },
    end(body) { this.body = body; this.writableEnded = true },
  }
  await handleTranscription(req, res, {}, async () => ({ text: '', clarification: 'Abra [trecho incerto]' }))
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.body), { text: '', clarification: 'Abra [trecho incerto]' })
})
test('specialized Portuguese ASR is preferred and preserves short questions without a confirmation stage', async () => {
  const calls = []
  const client = { interactions: { create: async (request) => { calls.push(request); return { output_text: 'Jarvis, que horas são?' } } }, models: { generateContent: () => { throw new Error('Fallback should not run') } } }
  assert.equal(await transcribeAudio(Buffer.alloc(2000), 'audio/wav', { client }), 'Jarvis, que horas são?')
  assert.deepEqual(calls[0].generation_config.transcription_config.language_codes, ['pt-BR'])
  assert.ok(calls[0].generation_config.transcription_config.custom_vocabulary.includes('Microsoft Word'))
  assert.equal(calls[0].store, false)
})
test('transcription service reports actionable status for timeout, quota and invalid credentials', async () => {
  const cases = [
    { error: Object.assign(new Error('timeout'), { name: 'TimeoutError' }), status: 504, message: /demorou demais/ },
    { error: Object.assign(new Error('quota'), { status: 429 }), status: 429, message: /Limite Gemini/ },
    { error: Object.assign(new Error('unauthorized'), { status: 401 }), status: 401, message: /chave Gemini foi recusada/ },
    { error: new Error('Configure a chave Gemini nos ajustes do aplicativo.'), status: 503, message: /Configure a chave Gemini/ },
  ]
  for (const item of cases) {
    const req = Readable.from([Buffer.alloc(2000)])
    req.headers = { 'content-type': 'audio/wav' }
    const res = {
      writableEnded: false,
      destroyed: false,
      on() {},
      writeHead(status) { this.statusCode = status },
      end(body) { this.body = body; this.writableEnded = true },
    }
    await handleTranscription(req, res, {}, async () => { throw item.error })
    assert.equal(res.statusCode, item.status)
    assert.match(JSON.parse(res.body).error, item.message)
  }
})
test('transcription service returns a timeout even when the provider ignores its abort signal', async () => {
  const req = Readable.from([Buffer.alloc(2000)])
  req.headers = { 'content-type': 'audio/wav' }
  const res = {
    writableEnded: false,
    destroyed: false,
    on() {},
    writeHead(status) { this.statusCode = status },
    end(body) { this.body = body; this.writableEnded = true },
  }
  await handleTranscription(req, res, {}, () => new Promise(() => {}), 10)
  assert.equal(res.statusCode, 504)
  assert.match(JSON.parse(res.body).error, /demorou demais/)
})
test('a slow specialized ASR falls back to Gemini audio transcription within the request budget', async () => {
  const calls = []
  const client = {
    interactions: { create: async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) } },
    models: { generateContent: async (request) => { calls.push(request); return { text: JSON.stringify({ speech: true, clear: true, text: 'Jarvis, abra o Word.' }) } } },
  }
  assert.equal(await transcribeAudio(Buffer.alloc(2000), 'audio/wav', { client }), 'Jarvis, abra o Word.')
  assert.equal(calls.length, 1)
  assert.match(calls[0].contents[0].parts[0].text, /Não responda/)
})
