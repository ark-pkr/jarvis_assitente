import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { chromeServer, closeBrowser, normalizeSearchResults, validateBrowserUrl } from './browser.mjs'
import { fileURLToPath } from 'node:url'
process.env.JARVIS_BROWSER_PROFILE = fileURLToPath(new URL('../.ui-check.local/browser-profile', import.meta.url))

test('browser rejects non-web URLs and embedded credentials', () => {
  for (const url of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'http://user:pass@example.com']) {
    assert.throws(() => validateBrowserUrl(url))
  }
  assert.equal(validateBrowserUrl('https://example.com'), 'https://example.com/')
})

test('web research results include deduplicated public source links and discard invalid targets', () => {
  const results = normalizeSearchResults([
    { title: 'Source one', url: 'https://example.com/article#section', snippet: '  Useful excerpt  ' },
    { title: 'Duplicate', url: 'https://example.com/article', snippet: 'duplicate' },
    { title: 'Search page', url: 'https://www.google.com/search?q=test' },
    { title: 'Regional search page', url: 'https://www.google.com.br/search?q=test' },
    { title: 'Local service', url: 'http://127.0.0.1:8787/health' },
    { title: 'Bad protocol', url: 'file:///C:/Windows/win.ini' },
    { title: 'Source two', url: 'https://example.org/report' },
  ])
  assert.deepEqual(results.map(({ title, domain }) => [title, domain]), [
    ['Source one', 'example.com'],
    ['Source two', 'example.org'],
  ])
  assert.equal(results[0].url, 'https://example.com/article')
  assert.equal(results[0].snippet, 'Useful excerpt')
})

test('browser clicks and fills only after approval; cancel and password never act', async () => {
  let allowed = false
  let confirmations = 0
  const fixture = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<body><button onclick="this.textContent=\'Executado\'">Enviar teste</button><label>Nome<input aria-label="Nome"></label><label>Senha<input aria-label="Senha" type="password"></label></body>')
  })
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
  const client = new Client({ name: 'approval-test', version: '1.0.0' })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  const server = chromeServer({ allowWrites: false, confirm: async (details) => {
    confirmations++
    assert.match(details.url, /^http:\/\/127\.0\.0\.1/)
    return { approved: allowed }
  } })
  try {
    await server.instance.connect(remote); await client.connect(local)
    await client.callTool({ name: 'chrome_navigate', arguments: { url: `http://127.0.0.1:${fixture.address().port}` } })
    const canceled = await client.callTool({ name: 'chrome_click', arguments: { role: 'button', name: 'Enviar teste' } })
    assert.equal(canceled.isError, true)
    assert.doesNotMatch((await client.callTool({ name: 'chrome_page_text', arguments: {} })).content[0].text, /Executado/)
    allowed = true
    const clicked = await client.callTool({ name: 'chrome_click', arguments: { role: 'button', name: 'Enviar teste' } })
    assert.ok(!clicked.isError)
    assert.match((await client.callTool({ name: 'chrome_page_text', arguments: {} })).content[0].text, /Executado/)
    const filled = await client.callTool({ name: 'chrome_form_input', arguments: { role: 'textbox', name: 'Nome', value: 'Teste local' } })
    assert.ok(!filled.isError)
    assert.match((await client.callTool({ name: 'chrome_read_page', arguments: {} })).content[0].text, /Teste local/)
    const password = await client.callTool({ name: 'chrome_form_input', arguments: { role: 'textbox', name: 'Senha', value: 'test-password' } })
    assert.equal(password.isError, true)
    assert.equal(confirmations, 3)
  } finally {
    await closeBrowser(); await client.close(); fixture.close()
  }
})

test('dedicated installed Chrome can navigate, read and capture; writes stay disabled', async () => {
  const fixture = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<html lang="pt-BR"><title>Teste JARVIS</title><body><h1>Navegação funcionando</h1><button>Continuar</button></body></html>')
  })
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
  const client = new Client({ name: 'browser-test', version: '1.0.0' })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  const server = chromeServer({ allowWrites: false })
  try {
    await server.instance.connect(remote)
    await client.connect(local)
    const { tools } = await client.listTools()
    assert.ok(!tools.some((t) => ['chrome_click', 'chrome_form_input'].includes(t.name)))
    const navigation = await client.callTool({ name: 'chrome_navigate', arguments: { url: `http://127.0.0.1:${fixture.address().port}` } })
    assert.ok(!navigation.isError, JSON.stringify(navigation))
    assert.match(navigation.content[0].text, /Teste JARVIS/)
    const reading = await client.callTool({ name: 'chrome_page_text', arguments: {} })
    assert.match(reading.content[0].text, /Navegação funcionando/)
    const tree = await client.callTool({ name: 'chrome_read_page', arguments: {} })
    assert.match(tree.content[0].text, /Continuar/)
    const picture = await client.callTool({ name: 'chrome_screenshot', arguments: {} })
    assert.equal(picture.content[0].type, 'image')
  } finally {
    await closeBrowser()
    await client.close()
    fixture.close()
  }
})
