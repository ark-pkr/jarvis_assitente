import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseResponsePace, isArticleRequest } from '../src/lib/responsePace.ts'

test('explicit spoken pace commands override automatic selection', () => {
  assert.deepEqual(chooseResponsePace('Explique isso com resposta rápida', false), { fast: true, reason: 'explicit-fast' })
  assert.deepEqual(chooseResponsePace('Investigue melhor esta informação', true), { fast: false, reason: 'explicit-deep' })
})

test('research and multi-part requests automatically receive deeper reasoning', () => {
  assert.equal(chooseResponsePace('Pesquise fontes e compare as divergências').fast, false)
  assert.equal(chooseResponsePace('Qual o custo? Quais são as alternativas?').fast, false)
  assert.equal(chooseResponsePace('Explique passo a passo').fast, false)
  assert.equal(chooseResponsePace('Escreva um artigo sobre energia solar').fast, false)
  assert.equal(chooseResponsePace('Elabore uma redação sobre educação').fast, false)
})

test('only article-writing requests activate article mode', () => {
  assert.equal(isArticleRequest('Escreva um artigo sobre energia solar'), true)
  assert.equal(isArticleRequest('Prepare um texto para o público infantil'), true)
  assert.equal(isArticleRequest('Pesquise artigos recentes sobre energia solar'), false)
})

test('simple questions use the saved speed preference', () => {
  assert.equal(chooseResponsePace('Que horas são?', true).fast, true)
  assert.equal(chooseResponsePace('Que horas são?', false).fast, false)
})
