import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseTurns } from './metrics.mjs'

test('the summary says how fast, and for slow turns where the time went', () => {
  const quick = (ms) => ({ firstTextMs: ms, totalMs: ms + 100 })
  const slow = { firstTextMs: 20000, totalMs: 21000, steps: 6, toolCalls: 5, modelMs: 8000, toolMs: 12000, approvalMs: 9000, inputTokens: 60000, deep: true }
  const summary = summariseTurns([quick(1000), quick(2000), quick(3000), { firstTextMs: 9000, totalMs: 9000 }, slow, { broken: true }])
  assert.equal(summary.turns, 5)
  assert.equal(summary.firstWord.median, 3000)
  assert.equal(summary.slow, 2)
  assert.deepEqual(summary.breakdown, { turns: 1, steps: 6, toolCalls: 5, modelMs: 8000, toolMs: 12000, approvalMs: 9000, inputTokens: 60000, deep: 1 })
  assert.equal(summariseTurns([quick(1000)]).breakdown, null, 'nothing slow, nothing to break down')
})
