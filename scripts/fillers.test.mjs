import test from 'node:test'
import assert from 'node:assert/strict'
import { forRequest } from '../src/lib/fillers.ts'

test('a request that will wait on something slow says so at once', () => {
  assert.match(forRequest('Como está o clima em Balsas?'), /previsão|clima/)
  assert.match(forRequest('Vai chover amanhã?'), /previsão|clima/)
  assert.equal(forRequest('Pesquise o preço do dólar'), 'Pesquisando.')
  assert.equal(forRequest('Quais são as notícias de hoje?'), 'Pesquisando.')
  assert.equal(forRequest('Olha minha tela'), 'Olhando sua tela.')
})

test('a request answered in a moment gets no line ahead of the answer', () => {
  assert.equal(forRequest('Qual é a capital do Chile?'), null)
  assert.equal(forRequest('Pausa a música'), null)
  assert.equal(forRequest('Que horas são?'), null)
  assert.equal(forRequest('Coloca o volume em trinta'), null)
})
