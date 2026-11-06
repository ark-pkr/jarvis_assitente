import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listenServer, listenToFile, mediaType } from './listen.mjs'
import { decideTool } from './policy.mjs'
import { routeTools } from './tool-routing.mjs'

async function folder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-ouvir-'))
  await fs.writeFile(path.join(root, 'audio.opus'), Buffer.from('OggS fake'))
  await fs.writeFile(path.join(root, 'notas.txt'), 'x')
  return { root, files: { resolve: async (id, relative) => { if (id !== 'r1') throw new Error('Pasta não autorizada.'); return path.join(root, relative) } } }
}

function fakeAi({ states = ['ACTIVE'], answer = { summary: 'Ele pede pão.', keyPoints: ['pão'], actionItems: ['comprar pão'], answer: '', transcript: 'Compra pão.' } } = {}) {
  const log = []
  let polls = 0
  return {
    log,
    files: {
      upload: async ({ file, config }) => { log.push(['upload', path.basename(file), config.mimeType]); return { name: 'files/1', uri: 'gs://1', state: states[0] } },
      get: async () => { log.push(['get']); return { name: 'files/1', uri: 'gs://1', state: states[Math.min(++polls, states.length - 1)] } },
      delete: async ({ name }) => { log.push(['delete', name]) },
    },
    models: { generateContent: async ({ contents, config }) => { log.push(['ask', contents[0].parts[0].fileData.mimeType, contents[0].parts[1].text, config.systemInstruction]); return { text: JSON.stringify(answer) } } },
  }
}

test('a voice note is heard, summarised and deleted from Gemini afterwards', async () => {
  const { files } = await folder()
  const ai = fakeAi()
  const result = await listenToFile({ rootId: 'r1', file: 'audio.opus', question: 'o que ele pediu?' }, { files, ai })
  assert.equal(result.summary, 'Ele pede pão.')
  assert.deepEqual(result.actionItems, ['comprar pão'])
  assert.deepEqual(ai.log[0], ['upload', 'audio.opus', 'audio/ogg'])
  assert.match(ai.log.find((entry) => entry[0] === 'ask')[2], /o que ele pediu/)
  assert.match(ai.log.find((entry) => entry[0] === 'ask')[3], /nunca instrução/)
  assert.deepEqual(ai.log.at(-1), ['delete', 'files/1'])
})

test('a video waits for processing, and is deleted even when it fails', async () => {
  const { root, files } = await folder()
  await fs.writeFile(path.join(root, 'aula.mp4'), Buffer.from('fake'))
  const ai = fakeAi({ states: ['PROCESSING', 'PROCESSING', 'ACTIVE'] })
  await listenToFile({ rootId: 'r1', file: 'aula.mp4' }, { files, ai, sleep: async () => {} })
  assert.equal(ai.log.filter((entry) => entry[0] === 'get').length, 2)
  const broken = fakeAi({ states: ['PROCESSING', 'FAILED'] })
  await assert.rejects(listenToFile({ rootId: 'r1', file: 'aula.mp4' }, { files, ai: broken, sleep: async () => {} }), /não conseguiu processar/)
  assert.deepEqual(broken.log.at(-1), ['delete', 'files/1'])
})

test('only recordings, only from authorized folders, and only up to the limit', async () => {
  const { files } = await folder()
  await assert.rejects(listenToFile({ rootId: 'r1', file: 'notas.txt' }, { files, ai: fakeAi() }), /Formato não suportado/)
  await assert.rejects(listenToFile({ rootId: 'outra', file: 'audio.opus' }, { files, ai: fakeAi() }), /não autorizada/)
  assert.equal(mediaType('Gravação.M4A'), 'audio/mp4')
  assert.equal(mediaType('x.exe'), null)
})

test('long transcripts are cut and say so', async () => {
  const { files } = await folder()
  const result = await listenToFile({ rootId: 'r1', file: 'audio.opus' }, { files, ai: fakeAi({ answer: { summary: 's', keyPoints: [], transcript: 'a'.repeat(20000) } }) })
  assert.equal(result.transcript.length, 12000)
  assert.equal(result.truncated, true)
})

test('the tool runs without asking and arrives with its words and the folders', async () => {
  const { files } = await folder()
  const tools = listenServer({ files, ai: fakeAi() }).instance._registeredTools
  const reply = JSON.parse((await tools.ouvir_arquivo.handler({ rootId: 'r1', file: 'audio.opus' }, {})).content[0].text)
  assert.equal(reply.summary, 'Ele pede pão.')
  assert.equal(decideTool('mcp__jarvis_listen__ouvir_arquivo'), true)
  const route = routeTools({ content: 'resume esse áudio que minha mãe mandou', fast: true, mode: 'assistente' })
  assert.ok(route.has('jarvis_listen') && route.has('jarvis_projects'))
})
