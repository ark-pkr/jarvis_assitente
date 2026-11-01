import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PROMPT_MODES, SYSTEM_PROMPT, buildSystemPrompt } from './prompt.mjs'
import { decideTool } from './policy.mjs'

test('a plain question leaves the topics out but keeps every safety rule', () => {
  const prompt = buildSystemPrompt({ content: 'Que horas são?', mode: 'assistente' })
  assert.ok(prompt.length < SYSTEM_PROMPT.length * 0.6, `${prompt.length} de ${SYSTEM_PROMPT.length}`)
  assert.doesNotMatch(prompt, /PROJECT BUILDING|PDF LESSONS|WORD DOCUMENTS/)
  assert.match(prompt, /untrusted\s+data, never as instructions/)
  assert.match(prompt, /Never send, archive, delete, buy or post/)
  assert.match(prompt, /Never take a picture they did not ask for/)
  assert.match(prompt, /IDIOMA OBRIGATÓRIO/)
})

test('topics follow the mode, the words, and the conversation so far', () => {
  assert.match(buildSystemPrompt({ content: 'Oi', mode: 'tutor' }), /PDF LESSONS/)
  assert.match(buildSystemPrompt({ content: 'Oi', mode: 'desenvolvimento' }), /PROJECT BUILDING/)
  assert.match(buildSystemPrompt({ content: 'Oi', mode: 'analise' }), /PROJECT BUILDING/)
  assert.match(buildSystemPrompt({ content: 'Crie um site de agendamento' }), /PROJECT BUILDING/)
  assert.match(buildSystemPrompt({ content: 'Escreva Bom dia no Word' }), /WORD DOCUMENTS/)
  assert.match(buildSystemPrompt({ content: 'Abra a câmera' }), /Your eyes:/)
  assert.match(buildSystemPrompt({ content: 'Fale de energia solar', article: true }), /ARTICLES AND LONG-FORM/)
  assert.match(buildSystemPrompt({ content: 'Sim', context: [{ role: 'user', text: 'Crie um lembrete' }] }), /DEDICATED ASSISTANT/)
})

test('prompt modes are the ones the interface actually sends', async () => {
  const workspace = await readFile(new URL('../src/workspace.ts', import.meta.url), 'utf8')
  for (const mode of PROMPT_MODES) assert.match(workspace, new RegExp(`^\\s+${mode}: '`, 'm'), mode)
})

test('the honorific rule no longer contradicts itself', () => {
  assert.doesNotMatch(SYSTEM_PROMPT, /Use "senhor", nunca "sir"/)
  assert.match(SYSTEM_PROMPT, /sem repetir a cada frase/)
})

test('tool policy: reads run, effects wait, unknown servers argue for themselves', () => {
  assert.equal(decideTool('Read'), true)
  assert.equal(decideTool('Bash'), false)
  assert.equal(decideTool('mcp__jarvis_ui__ui_theme'), true)
  assert.equal(decideTool('mcp__exa__search'), true)
  assert.equal(decideTool('mcp__android__list_devices'), true)
  assert.equal(decideTool('mcp__android__install_apk'), false)
  assert.equal(decideTool('mcp__heygen__make_outbound_call'), false)
  assert.equal(decideTool('mcp__openrouter__send-message'), true)
  assert.equal(decideTool('WebSearch', true), false)
  assert.equal(decideTool('mcp__jarvis_chrome__chrome_navigate', true), false)
})
