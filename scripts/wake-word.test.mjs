import test from 'node:test'
import assert from 'node:assert/strict'
import { afterWake, calledByName } from '../src/lib/wake.ts'

test('the name at the edge of a sentence is a call', () => {
  for (const said of [
    'Jarvis, abre o Word',
    'jarvis que horas são',
    'Ô Jarvis, toca uma música',
    'e aí Jarvis, tudo bem?',
    'Oi Jarvis.',
    'Jarvis',
    'abre o Word, Jarvis',
    'que horas são, Jarvis?',
    // A customer's sentence and the call in one recording, split by punctuation.
    'Pode ser amanhã às três. Jarvis, marca isso na agenda.',
  ]) assert.equal(calledByName(said), true, said)
})

test('the name in the middle of talk about him is not a call', () => {
  for (const said of [
    'esse é o tal do Jarvis que você me falou ontem',
    'meu sobrinho usa o Jarvis no computador dele também',
    'você viu que o Jarvis respondeu sozinho de novo hoje',
    'quanto custa esse carregador aí moço',
    'pode embrulhar pra presente por favor',
    '',
  ]) assert.equal(calledByName(said), false, said)
})

test('what follows the name is the command', () => {
  assert.equal(afterWake('Jarvis, abre o Word'), 'abre o Word')
  assert.equal(afterWake('Pode ser amanhã. Jarvis, marca isso.'), 'marca isso.')
})
