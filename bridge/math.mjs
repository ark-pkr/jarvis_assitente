import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * Sums and calendars, done by code.
 *
 * The light model said 1.201 for a sum whose answer is 1.210, and "segunda + 10
 * dias" came out quarta. Asking it to check itself only moves the guess. So the
 * model writes the expression and this computes it: a small parser that knows
 * numbers, the four operations, powers, percentages and a few functions, and
 * nothing else. No eval, so nothing it is handed can run.
 */

const FUNCTIONS = {
  raiz: Math.sqrt, sqrt: Math.sqrt, abs: Math.abs, arredondar: Math.round, round: Math.round,
  piso: Math.floor, floor: Math.floor, teto: Math.ceil, ceil: Math.ceil, log: Math.log10, ln: Math.log,
}

/** Evaluates an arithmetic expression. Decimals use a dot; `15%` means 0.15. */
export function evaluate(expression) {
  const source = String(expression).replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')
  if (!source || source.length > 300) throw new Error('Expressão vazia ou longa demais.')
  let at = 0
  const peek = () => source[at]
  const fail = () => { throw new Error(`Não entendi a expressão perto de "${source.slice(at, at + 10) || 'fim'}".`) }
  const number = () => {
    const match = /^\d+(?:\.\d+)?|^\.\d+/.exec(source.slice(at))
    if (!match) fail()
    at += match[0].length
    return Number(match[0])
  }
  const primary = () => {
    if (peek() === '(') { at++; const value = sum(); if (peek() !== ')') fail(); at++; return value }
    if (peek() === '-') { at++; return -power() }
    if (peek() === '+') { at++; return power() }
    const name = /^[a-z]+/i.exec(source.slice(at))?.[0]?.toLowerCase()
    if (name) {
      if (!Object.hasOwn(FUNCTIONS, name) || source[at + name.length] !== '(') fail()
      at += name.length
      return FUNCTIONS[name](primary())
    }
    return number()
  }
  const postfix = () => {
    let value = primary()
    while (peek() === '%') { at++; value /= 100 }
    return value
  }
  const power = () => {
    const base = postfix()
    if (peek() === '^') { at++; return base ** power() }
    return base
  }
  const product = () => {
    let value = power()
    while (peek() === '*' || peek() === '/') {
      const op = source[at++]
      const right = power()
      if (op === '/' && right === 0) throw new Error('Divisão por zero.')
      value = op === '*' ? value * right : value / right
    }
    return value
  }
  const sum = () => {
    let value = product()
    while (peek() === '+' || peek() === '-') value = source[at++] === '+' ? value + product() : value - product()
    return value
  }
  const value = sum()
  if (at !== source.length) fail()
  if (!Number.isFinite(value)) throw new Error('O resultado não é um número finito.')
  return value
}

/** As it is said in Brazil: 1.210,5 */
export const spoken = (value, decimals = 6) => Number(value.toFixed(decimals)).toLocaleString('pt-BR', { maximumFractionDigits: decimals })

const TIME_ZONE = 'America/Sao_Paulo'
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const DAY_MS = 86400000

/** A calendar day as a UTC midnight, so adding days never trips over hours. */
export function parseDay(value, now = Date.now()) {
  const text = String(value ?? '').trim().toLowerCase()
  const today = new Date(now).toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
  const iso = text === 'hoje' || !text ? today
    : text === 'amanhã' || text === 'amanha' ? new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
      : text === 'ontem' ? new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)
        : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text
          : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) ? text.split('/').reverse().map((part) => part.padStart(2, '0')).join('-')
            : null
  const time = iso ? Date.parse(`${iso}T00:00:00Z`) : NaN
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== iso) throw new Error(`Data inválida: ${value}. Use AAAA-MM-DD, DD/MM/AAAA, hoje, amanhã ou ontem.`)
  return time
}

const describe = (time) => {
  const date = new Date(time)
  return { date: date.toISOString().slice(0, 10), weekday: WEEKDAYS[date.getUTCDay()], spoken: `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} de ${date.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })} de ${date.getUTCFullYear()}` }
}

export function shiftDay(start, amount, unit) {
  const date = new Date(start)
  if (unit === 'dias') date.setUTCDate(date.getUTCDate() + amount)
  else if (unit === 'semanas') date.setUTCDate(date.getUTCDate() + amount * 7)
  else {
    const months = unit === 'anos' ? amount * 12 : amount
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + months)
    // 31 de janeiro + 1 mês é o último dia de fevereiro, não 3 de março.
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, last))
  }
  return date.getTime()
}

export function dayMath({ op, date, amount = 0, unit = 'dias', other }, now = Date.now()) {
  const start = parseDay(date, now)
  if (op === 'dia_da_semana') return describe(start)
  if (op === 'somar') return { from: describe(start).date, ...describe(shiftDay(start, amount, unit)) }
  const end = parseDay(other, now)
  const days = Math.round((end - start) / DAY_MS)
  let businessDays = 0
  for (let time = Math.min(start, end) + DAY_MS; time <= Math.max(start, end); time += DAY_MS) if (![0, 6].includes(new Date(time).getUTCDay())) businessDays++
  return { from: describe(start), to: describe(end), days, weeks: Math.floor(Math.abs(days) / 7), extraDays: Math.abs(days) % 7, businessDays }
}

export function mathServer() {
  const safe = (handler) => async (args) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await handler(args)) }] } }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] } }
  }
  return createSdkMcpServer({ name: 'jarvis_math', version: '1.0.0', tools: [
    tool('calcular', 'Faz contas exatas. Use SEMPRE que a resposta depender de uma conta com números (soma, troco, porcentagem, juros, média, divisão de conta, conversão), em vez de calcular de cabeça. Escreva a expressão com ponto decimal: + - * / ^, parênteses, % (15% = 0,15) e as funções raiz, abs, arredondar, piso, teto, log e ln. Ex.: "1250*(1+0.02)^12", "200*15%", "(350+420+389)/3". Fale o resultado no formato brasileiro. Não pede confirmação.', {
      expression: z.string().trim().min(1).max(300),
    }, safe(({ expression }) => { const value = evaluate(expression); return { expression, result: value, spoken: spoken(value) } })),
    tool('datas', 'Faz contas de calendário exatas: somar ou subtrair dias, semanas, meses ou anos a uma data (op "somar", amount negativo para subtrair), quantos dias e dias úteis entre duas datas (op "diferenca") e que dia da semana cai uma data (op "dia_da_semana"). Use SEMPRE para essas perguntas, em vez de contar de cabeça. Datas em AAAA-MM-DD, DD/MM/AAAA, hoje, amanhã ou ontem. Não pede confirmação.', {
      op: z.enum(['somar', 'diferenca', 'dia_da_semana']),
      date: z.string().trim().max(20).default('hoje'),
      amount: z.number().int().min(-36500).max(36500).optional(),
      unit: z.enum(['dias', 'semanas', 'meses', 'anos']).optional(),
      other: z.string().trim().max(20).optional().describe('A segunda data, para "diferenca".'),
    }, safe((args) => dayMath(args))),
  ] })
}
