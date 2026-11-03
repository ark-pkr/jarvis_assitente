import test from 'node:test'
import assert from 'node:assert/strict'
import { compactConversation, ConversationSummary } from './conversation.mjs'

const talk = (count, length = 2000) => Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'jarvis' : 'user', text: `${i}: ${'x'.repeat(length)}` }))

test('a conversation within the budget goes as it is', () => {
  const short = talk(30, 100)
  assert.deepEqual(compactConversation(short, new ConversationSummary()), { entries: short, older: null })
})

test('past the budget, the latest go whole and the older ones go clipped until a summary exists', () => {
  const long = talk(30)
  const { entries, older } = compactConversation(long, new ConversationSummary())
  assert.equal(older.length, 22)
  assert.deepEqual(entries.slice(-8), long.slice(-8), 'the latest exactly as they were')
  assert.ok(entries.slice(0, -8).every((entry) => entry.text.length <= 281))
  assert.ok(entries.reduce((total, entry) => total + entry.text.length, 0) < long.reduce((total, entry) => total + entry.text.length, 0) / 2)
})

test('once summarised, the beginning goes as one summary, and what came after it is clipped', async () => {
  const summary = new ConversationSummary()
  const long = talk(30)
  const sent = []
  await summary.refresh(compactConversation(long, summary).older, async (transcript) => { sent.push(transcript); return 'Estudavam redes; faltou o exercício 4.' })
  assert.match(sent[0], /^Usuário: 0:/)
  const later = [...long, ...talk(4)]
  const { entries } = compactConversation(later, summary)
  assert.match(entries[0].text, /Resumo do começo desta conversa[\s\S]*exercício 4/)
  assert.equal(entries[1].role, 'jarvis')
  assert.equal(entries.length, 2 + 4 + 8, 'summary pair, the four in between, the latest eight')
  assert.equal(compactConversation(talk(30, 2100), summary).entries[0].text.startsWith('Resumo'), false, 'another conversation does not get it')
})

test('a summary that fails costs nothing but the summary', async () => {
  const summary = new ConversationSummary()
  const { older } = compactConversation(talk(30), summary)
  await summary.refresh(older, async () => { throw new Error('sem rede') })
  assert.equal(summary.lookup(older), null)
})
