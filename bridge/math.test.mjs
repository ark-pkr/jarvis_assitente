import test from 'node:test'
import assert from 'node:assert/strict'
import { dayMath, evaluate, mathServer, parseDay, spoken } from './math.mjs'
import { decideTool } from './policy.mjs'
import { routeTools } from './tool-routing.mjs'

test('sums come out exact, including the one the model got wrong', () => {
  assert.equal(evaluate('350+420+440'), 1210)
  assert.equal(spoken(evaluate('350+420+440')), '1.210')
  assert.equal(evaluate('200*15%'), 30)
  assert.equal(evaluate('2+3*4'), 14)
  assert.equal(evaluate('(2+3)*4'), 20)
  assert.equal(evaluate('2^3^2'), 512, 'potência associa à direita')
  assert.equal(evaluate('-2^2'), -4)
  assert.equal(evaluate('raiz(144)+abs(-3)'), 15)
  assert.equal(spoken(evaluate('1250*(1+0.02)^12'), 2), '1.585,3')
  assert.equal(evaluate('10 ÷ 4 × 2'), 5)
})

test('anything that is not arithmetic is refused, never run', () => {
  for (const bad of ['process.exit()', 'alert(1)', '2+', '(2', '2)', 'raiz 4', '', '1/0', 'constructor', 'constructor(1)', 'toString(1)', '__proto__(1)']) assert.throws(() => evaluate(bad), undefined, bad)
})

test('calendar arithmetic, including the day the model miscounted', () => {
  const now = Date.parse('2026-11-06T15:00:00Z')
  assert.equal(dayMath({ op: 'somar', date: '2026-11-09', amount: 10, unit: 'dias' }).weekday, 'quinta-feira', 'segunda + 10 dias é quinta')
  assert.equal(dayMath({ op: 'somar', date: '2026-01-31', amount: 1, unit: 'meses' }).date, '2026-02-28')
  assert.equal(dayMath({ op: 'somar', date: '2024-02-29', amount: 1, unit: 'anos' }).date, '2025-02-28')
  assert.equal(dayMath({ op: 'somar', date: 'hoje', amount: -1, unit: 'semanas' }, now).date, '2026-10-30')
  const between = dayMath({ op: 'diferenca', date: '2026-11-06', other: '2026-12-25' })
  assert.equal(between.days, 49)
  assert.equal(between.weeks, 7)
  assert.equal(dayMath({ op: 'diferenca', date: '2026-11-06', other: '2026-11-13' }).businessDays, 5)
  assert.equal(dayMath({ op: 'dia_da_semana', date: '25/12/2026' }).spoken, 'sexta-feira, 25 de dezembro de 2026')
  assert.equal(new Date(parseDay('amanhã', now)).toISOString().slice(0, 10), '2026-11-07')
  assert.throws(() => parseDay('2026-02-30'), /Data inválida/)
})

test('the tools answer through the server, and errors are told, not thrown', async () => {
  const tools = mathServer().instance._registeredTools
  const sum = JSON.parse((await tools.calcular.handler({ expression: '350+420+440' }, {})).content[0].text)
  assert.equal(sum.spoken, '1.210')
  assert.equal((await tools.calcular.handler({ expression: '2+' }, {})).isError, true)
  const day = JSON.parse((await tools.datas.handler({ op: 'dia_da_semana', date: '2026-12-25' }, {})).content[0].text)
  assert.equal(day.weekday, 'sexta-feira')
})

test('math runs without asking and arrives with the words that need it', () => {
  assert.equal(decideTool('mcp__jarvis_math__calcular'), true)
  const route = (content) => routeTools({ content, fast: true, mode: 'assistente' })
  assert.ok(route('quanto é 15% de 230?').has('jarvis_math'))
  assert.ok(route('que dia cai daqui a 45 dias?').has('jarvis_math'))
  assert.ok(!route('abre o word').has('jarvis_math'))
})
