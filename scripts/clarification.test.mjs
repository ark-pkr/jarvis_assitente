import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeClarification, splitUnclearTranscript } from '../src/lib/clarification.ts'

test('only one explicitly marked uncertain segment can be clarified', () => {
  assert.deepEqual(splitUnclearTranscript('Abra a pasta [trecho incerto] no explorador'), {
    before: 'Abra a pasta ',
    after: ' no explorador',
  })
  assert.equal(splitUnclearTranscript('Abra [trecho incerto] e mova [trecho incerto]'), null)
  assert.equal(splitUnclearTranscript('Transcrição incompleta'), null)
})

test('the repeated segment replaces the uncertainty without creating a separate command', () => {
  const parts = splitUnclearTranscript('Abra a pasta [trecho incerto] no explorador')
  assert.ok(parts)
  assert.equal(mergeClarification(parts, 'Projetos'), 'Abra a pasta Projetos no explorador')
})
