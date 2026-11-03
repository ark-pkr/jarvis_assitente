import test from 'node:test'
import assert from 'node:assert/strict'
import { judge, parseArgs } from './eval-judge.mjs'
import { CASES } from './eval-cases.mjs'

const answering = (reply) => {
  const sent = []
  return { sent, models: { generateContent: async (request) => { sent.push(request); return { text: JSON.stringify(reply) } } } }
}

test('the judge reads the conversation, the answer and the criterion', async () => {
  const ai = answering({ cumpre: true, motivo: 'escolheu desktop e disse por quê' })
  const verdict = await judge({ criterion: 'Escolhe uma opção.', conversation: [{ role: 'user', text: 'notebook ou desktop?' }], answer: 'Desktop, sem dúvida.' }, { ai })
  assert.deepEqual(verdict, { passed: true, reason: 'escolheu desktop e disse por quê' })
  assert.match(ai.sent[0].contents, /Usuário: notebook ou desktop\?[\s\S]*Desktop, sem dúvida\.[\s\S]*Escolhe uma opção\./)
})

test('no answer, an unreachable judge or a garbled verdict is a failure, never a pass', async () => {
  assert.equal((await judge({ criterion: 'x', conversation: [], answer: '  ' }, { ai: answering({ cumpre: true }) })).passed, false)
  const down = { models: { generateContent: async () => { throw new Error('429') } } }
  assert.match((await judge({ criterion: 'x', conversation: [], answer: 'oi' }, { ai: down })).reason, /juiz indisponível/)
  assert.equal((await judge({ criterion: 'x', conversation: [], answer: 'oi' }, { ai: { models: { generateContent: async () => ({ text: 'talvez' }) } } })).passed, false)
})

test('the label, the cases and the repetitions can come in any order', () => {
  assert.deepEqual(parseArgs([]), { label: 'atual', only: [], times: 1 })
  assert.deepEqual(parseArgs(['depois', '--vezes=3', 'troco', 'idade']), { label: 'depois', only: ['troco', 'idade'], times: 3 })
  assert.equal(parseArgs(['x', '--vezes=zero']).times, 1)
})

test('every case has a unique id and something to check', () => {
  const ids = CASES.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const item of CASES) assert.ok(item.tool || item.noTool || item.says || item.notSays || item.judge || item.maxWords, item.id)
})
