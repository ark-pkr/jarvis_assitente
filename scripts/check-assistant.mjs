import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const prefix = `Teste central ${Date.now()}`
let page
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  await page.goto('http://localhost:5173')
  const open = async () => {
    await page.getByRole('button', { name: /INICIAR JARVIS/ }).waitFor()
    await page.evaluate(async () => (await import('/src/store.ts')).useStore.setState({ phase: 'dormant' }))
    await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
    await page.getByRole('button', { name: 'Central', exact: true }).click()
  }
  await open()
  await page.getByLabel('Título do registro', { exact: true }).fill(prefix)
  await page.getByLabel('Notas do registro').fill('Projeto de teste automatizado')
  await page.getByLabel('Próximo passo', { exact: true }).fill('Revisar API')
  await page.getByRole('button', { name: 'Salvar registro', exact: true }).click()
  await page.getByText('Registro salvo no computador.', { exact: true }).waitFor()
  await page.reload(); await open()
  const card = page.locator('article.assistant-entry').filter({ hasText: prefix }).first()
  await card.waitFor(); assert.match(await card.textContent(), /Revisar API/)
  await card.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Situação do registro').selectOption('executando')
  await page.getByRole('button', { name: 'Salvar registro', exact: true }).click()
  await page.getByText('Registro salvo no computador.', { exact: true }).waitFor()
  await page.getByLabel('Tipo do registro').selectOption('lembrete')
  await page.getByLabel('Título do registro', { exact: true }).fill(prefix + ' lembrete')
  await page.getByLabel('Data do lembrete').fill('2026-01-01T19:00')
  await page.getByRole('button', { name: 'Salvar registro', exact: true }).click()
  await page.getByText('Registro salvo no computador.', { exact: true }).waitFor()
  await page.getByLabel('Fechar ajustes', { exact: true }).click()
  await page.getByLabel('Lembretes', { exact: true }).getByText(`Lembrete: ${prefix} lembrete`, { exact: true }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Onde eu parei?', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.ui-check.local/assistant-central.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  const bounds = await page.locator('.workspace-panel').boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  console.log('Central: create, persist, update, reminder alert and mobile layout passed.')
} finally {
  if (page) await page.evaluate(async (prefix) => {
    const url = 'http://localhost:8787/assistant'
    const state = await (await fetch(url)).json()
    for (const entry of state.entries.filter((item) => item.title.startsWith(prefix))) await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: entry.id }) })
  }, prefix).catch(() => {})
  await browser.close()
}
