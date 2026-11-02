import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { diagnosticReport, redact, watchLogs } from './diagnostics.mjs'

test('secrets never reach text made to be pasted', () => {
  const env = { GEMINI_API_KEY: 'chave-sem-formato-conhecido', JARVIS_SESSION_TOKEN: 'abc123456789', PATH: 'C:/nao-e-segredo' }
  const out = redact(`falhou chave-sem-formato-conhecido e abc123456789 em C:/nao-e-segredo AIzaSyA1234567890abcdefghijklmnop Authorization: Bearer abc.def https://x.dev/a?key=valor&y=1 sk_1234567890abcdef1234 aluno@faculdade.edu.br ${homedir()}\\Documents`, env)
  for (const secret of ['chave-sem-formato', 'abc123456789', 'AIzaSy', 'abc.def', 'valor', 'sk_1234', 'aluno@', homedir()]) assert.ok(!out.includes(secret), secret)
  assert.match(out, /C:\/nao-e-segredo/)
  assert.match(out, /~\\Documents/)
})

test('the report carries recent errors, redacted and capped, and what the screen sent', () => {
  const target = { warn() {}, error() {} }
  watchLogs(target)
  target.warn('[jarvis] voz: falhou para', 'aluno@faculdade.edu.br')
  target.error(new Error('x'.repeat(1000)))
  const report = diagnosticReport({ provider: 'gemini', model: 'modelo' }, { phase: 'idle', speech: { engine: 'gemini' }, errors: ['tela quebrou'] })
  assert.match(report, /gemini modelo/)
  assert.match(report, /voz: falhou para \[e-mail\]/)
  assert.match(report, /tela quebrou/)
  assert.ok(!report.includes('x'.repeat(301)))
})

test('a report survives a screen that sent nothing useful', () => {
  assert.match(diagnosticReport({ provider: 'gemini', model: 'm' }, { errors: 'não é lista' }), /Erros da tela:\nnenhum/)
})
