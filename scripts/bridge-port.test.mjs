import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyBridgePort, bridgePort } from '../vite.config.ts'

test('the interface follows the port the bridge was given', () => {
  assert.equal(bridgePort({}), '8787')
  assert.equal(bridgePort({ JARVIS_BRIDGE_PORT: '8799' }), '8799')
  assert.equal(bridgePort({ VITE_BRIDGE_URL: 'ws://localhost:9001', JARVIS_BRIDGE_PORT: '8799' }), '9001')
})

test('the page policy allows the bridge wherever it moved to', async () => {
  const html = applyBridgePort(await readFile(new URL('../index.html', import.meta.url), 'utf8'), '8799')
  const policy = html.match(/connect-src[^;]+;/)[0]
  assert.match(policy, /http:\/\/localhost:8799/)
  assert.match(policy, /http:\/\/127\.0\.0\.1:8799/)
  assert.doesNotMatch(html, /:8787/)
})
