import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalQuestion, ASK_AGAIN, readAnswer } from '../src/lib/approvalVoice.ts'

test('a plain yes, however it is said', () => {
  for (const said of ['Sim', 'sim.', 'Pode', 'Pode sim!', 'Sim, pode seguir.', 'pode fazer', 'Confirmo', 'Autorizo', 'Ok', 'Sim, por favor', 'Jarvis, pode continuar']) {
    assert.equal(readAnswer(said), 'yes', said)
  }
})

test('a plain no, however it is said', () => {
  for (const said of ['Não', 'não.', 'Cancela', 'Cancelar', 'Negativo', 'Pare', 'Espera', 'Melhor não', 'Não pode', 'Agora não, obrigado']) {
    assert.equal(readAnswer(said), 'no', said)
  }
})

test('a refusal beats anything that sounds like agreement', () => {
  for (const said of ['Sim, não, espera', 'pode não', 'sim, cancela', 'Não, pode parar']) {
    assert.equal(readAnswer(said), 'no', said)
  }
})

test('a yes hidden in a sentence is not a yes', () => {
  for (const said of ['sim, mas antes me explica o que vai acontecer', 'assim fica melhor', 'pode ser que eu queira isso depois de amanhã de manhã', 'o que você vai fazer', 'quem pode saber', 'hoje está sol']) {
    assert.equal(readAnswer(said), null, said)
  }
})

test('words around an answer are not an answer alone', () => {
  for (const said of ['por favor', 'isso', 'claro', 'jarvis', 'fazer']) assert.equal(readAnswer(said), null, said)
})

test('nothing heard is no answer', () => {
  assert.equal(readAnswer(''), null)
  assert.equal(readAnswer('...'), null)
})

test('what he says aloud can never answer itself', () => {
  for (const action of ['Abrir Word', 'Excluir registro', 'Clicar em Enviar', 'Salvar no assistente dedicado']) {
    assert.equal(readAnswer(approvalQuestion(action)), null, action)
  }
  assert.notEqual(readAnswer(ASK_AGAIN), 'yes')
  // Echo arrives in pieces, so neither may any piece that survives alone.
  for (const piece of ['Posso seguir', 'seguir', 'posso', 'Posso seguir com isso']) assert.equal(readAnswer(piece), null, piece)
})

test('a long action is cut before it is read aloud', () => {
  assert.ok(approvalQuestion('x'.repeat(400)).length < 120)
})
