import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { visionServer } from './vision.mjs'

async function lookAtScreen(ask) {
  const [local, remote] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'teste', version: '1.0.0' })
  await visionServer(ask).instance.connect(remote)
  await client.connect(local)
  try { return await client.callTool({ name: 'screen_look', arguments: { reason: 'ver o erro' } }) }
  finally { await client.close() }
}

test('refusing the confirmation means the screen is never captured', async () => {
  const asked = []
  const result = await lookAtScreen(async (kind) => { asked.push(kind); return { approved: false } })
  assert.deepEqual(asked, ['approval'])
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /não autorizou/)
})

test('an approval with no clear yes counts as a refusal', async () => {
  const asked = []
  await lookAtScreen(async (kind) => { asked.push(kind); return { approved: 'talvez' } })
  assert.deepEqual(asked, ['approval'])
})

test('a timed-out confirmation does not capture either', async () => {
  const asked = []
  const result = await lookAtScreen(async (kind) => { asked.push(kind); throw new Error('the interface did not answer in time') })
  assert.deepEqual(asked, ['approval'])
  assert.equal(result.isError, true)
})

test('after a yes the model sees the image, labelled as untrusted', async () => {
  const asked = []
  const result = await lookAtScreen(async (kind, args) => {
    asked.push({ kind, ...args })
    return kind === 'approval' ? { approved: true } : { data: 'aW1hZ2Vt', mimeType: 'image/jpeg' }
  })
  assert.equal(asked[0].kind, 'approval')
  assert.match(asked[0].details, /enviada ao Gemini/)
  assert.deepEqual(asked[1], { kind: 'capture', mode: 'screen', reason: 'ver o erro' })
  assert.match(result.content[0].text, /não confiável/)
  assert.equal(result.content[1].type, 'image')
})

test('a capture that fails is reported, not invented', async () => {
  const result = await lookAtScreen(async (kind) => kind === 'approval' ? { approved: true } : { error: 'Olhar a tela só funciona no aplicativo do Windows.' })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /aplicativo do Windows/)
})
