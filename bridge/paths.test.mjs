import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceFile } from './paths.mjs'

const busy = (code, times) => {
  let calls = 0
  return { move: async () => { if (++calls <= times) throw Object.assign(new Error(code), { code }); return 'moved' }, calls: () => calls }
}

test('a file briefly held open by Windows is replaced on a later try', async () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    const { move, calls } = busy(code, 3)
    assert.equal(await replaceFile('a', 'b', { move, delayMs: 1 }), 'moved')
    assert.equal(calls(), 4)
  }
})

test('it gives up in the end instead of waiting for ever', async () => {
  const { move, calls } = busy('EPERM', 100)
  await assert.rejects(replaceFile('a', 'b', { move, delayMs: 1, attempts: 4 }), /EPERM/)
  assert.equal(calls(), 4)
})

test('a real failure is not retried', async () => {
  const { move, calls } = busy('ENOSPC', 100)
  await assert.rejects(replaceFile('a', 'b', { move, delayMs: 1 }), /ENOSPC/)
  assert.equal(calls(), 1)
})
