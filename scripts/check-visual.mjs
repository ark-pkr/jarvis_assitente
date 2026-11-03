/**
 * What the picture is being told to do, read back from the graphics card.
 *
 * Screenshots stall whenever Windows stops painting a window that is not in front,
 * and the screen's overlays flicker by themselves, so the uniforms are read
 * instead. The real app, on throwaway data, with a fake microphone.
 * npm run desktop:prepare first.
 */
import { _electron as electron } from 'playwright-core'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'

await fs.mkdir('.ui-check.local', { recursive: true })
const profile = await fs.mkdtemp(path.resolve('.ui-check.local/visual-'))
const env = { ...process.env, JARVIS_DESKTOP_TEST_DATA: profile, JARVIS_DESKTOP_PORT: '18794', JARVIS_IMPORT_ENV: path.resolve('.env.local') }
delete env.ELECTRON_RUN_AS_NODE
const out = process.env.JARVIS_SHOTS
const application = await electron.launch({ executablePath, args: [path.resolve('desktop-app'), '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env, timeout: 45000 })
try {
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => console.log('erro na página:', error.message))
  page.on('console', (message) => { if (/holograma/.test(message.text())) console.log(message.text().slice(0, 160)) })
  await page.evaluate(() => {
    const id = crypto.randomUUID()
    localStorage.setItem('jarvis.workspace.v1', JSON.stringify({ active: id, settings: { greeting: false, bootSeen: true, experienceVersion: 9, naturalVoice: false, reactiveStars: false }, sessions: [{ id, title: 'Teste', updated: Date.now(), turns: [] }] }))
  })
  await page.reload()
  // Windows throttles a window behind others, and everything measured here would be noise.
  await application.evaluate(({ BrowserWindow }) => { const main = BrowserWindow.getAllWindows().find((window) => !window.getURL().includes('mini')); main?.show(); main?.focus() })
  await page.waitForTimeout(2000)
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const uniform = (name) => page.evaluate((wanted) => {
    const gl = document.querySelector('.holo-core-canvas').getContext('webgl2')
    const made = gl.getParameter(gl.CURRENT_PROGRAM)
    const value = gl.getUniform(made, gl.getUniformLocation(made, wanted))
    return typeof value === 'number' ? value : [...value]
  }, name)
  const audioTab = async (label, on) => {
    await page.getByRole('button', { name: 'Histórico e ajustes', exact: true }).first().click()
    await page.getByRole('button', { name: 'Áudio', exact: true }).click()
    await page.getByLabel(label).setChecked(on)
    await page.getByRole('button', { name: 'Fechar ajustes' }).click()
  }
  const strongest = async (name) => {
    let most = 0
    for (let i = 0; i < 24; i++) { most = Math.max(most, Math.abs(await uniform(name))); await page.waitForTimeout(100) }
    return most
  }

  // The window opens on a real desktop, and a real mouse crossing it moves the camera too.
  let corner = [0, 0], centre = [1, 1]
  for (let attempt = 0; attempt < 4 && !(corner[0] > .1 && Math.abs(centre[0]) < .02); attempt++) {
    await page.mouse.move(size.width - 20, 20, { steps: 8 })
    await page.waitForTimeout(2500)
    corner = await uniform('uLook')
    await page.mouse.move(size.width / 2, size.height / 2, { steps: 8 })
    await page.waitForTimeout(2500)
    centre = await uniform('uLook')
  }
  console.log(`câmera: mouse no canto ${corner.map((v) => v.toFixed(3))} | no centro ${centre.map((v) => v.toFixed(3))}`)
  assert.ok(corner[0] > .1 && corner[1] > .02 && Math.abs(centre[0]) < .02, 'o mouse move a câmera')
  await audioTab('Câmera viva: o buraco negro acompanha o mouse', false)
  await page.mouse.move(size.width - 20, 20, { steps: 8 })
  await page.waitForTimeout(3000)
  const off = await uniform('uLook')
  console.log(`câmera desligada: ${off.map((v) => v.toFixed(3))}`)
  assert.ok(Math.abs(off[0]) < .01, 'desligada, a câmera volta ao centro')

  await page.getByRole('button', { name: /INICIAR JARVIS/ }).click()
  await page.waitForFunction(() => /OUVINDO/.test(document.querySelector('.status-text')?.textContent ?? ''), null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const without = await strongest('uPush')
  await audioTab('Estrelas que reagem à voz', true)
  const reacting = await strongest('uPush')
  console.log(`estrelas: desligadas ${without.toFixed(3)} | ligadas ${reacting.toFixed(3)}`)
  assert.equal(without, 0)
  assert.ok(reacting > .05, 'as estrelas reagem ao microfone')

  // Reading the worlds back: the mic pulls them in, and off they fade to nothing.
  const planet = () => uniform('uPlanets[1]')
  const reaches = []
  for (let i = 0; i < 24; i++) { const [x, y, z] = await planet(); reaches.push(Math.hypot(x, y, z)); await page.waitForTimeout(100) }
  console.log(`planeta: órbita entre ${Math.min(...reaches).toFixed(2)} e ${Math.max(...reaches).toFixed(2)} ouvindo`)
  assert.ok((await planet())[3] > 0, 'os planetas aparecem')
  assert.ok(Math.min(...reaches) < 12.7, 'o microfone puxa os planetas')
  await audioTab('Planetas em órbita que reagem à voz', false)
  await page.waitForFunction(() => {
    const gl = document.querySelector('.holo-core-canvas').getContext('webgl2')
    const made = gl.getParameter(gl.CURRENT_PROGRAM)
    return gl.getUniform(made, gl.getUniformLocation(made, 'uPlanets[1]'))[3] === 0
  }, null, { timeout: 8000 })
  await audioTab('Planetas em órbita que reagem à voz', true)
  console.log('ok  planetas orbitam, reagem ao microfone e podem ser desligados')

  const frames = await page.evaluate(() => new Promise((resolve) => {
    let count = 0
    const began = performance.now()
    const step = () => { count++; if (performance.now() - began < 3000) requestAnimationFrame(step); else resolve(count / 3) }
    requestAnimationFrame(step)
  }))
  console.log(`quadros por segundo com tudo ligado: ${frames.toFixed(0)}`)

  const fullScreen = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isFullScreen()))
  const seen = (selector) => page.locator(selector).first().isVisible()
  assert.equal(await seen('.mode-switch'), true)
  await page.keyboard.press('c')
  await page.waitForTimeout(1200)
  assert.equal(await fullScreen(), true, 'C abre em tela cheia')
  for (const selector of ['.mode-switch', '.hud-top', '.hud-bottom', '.workspace-open']) assert.equal(await seen(selector), false, selector)
  assert.equal(await seen('.cinema-hint'), true)
  if (out) await page.screenshot({ path: `${out}/visual-cinema.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
  assert.equal(await fullScreen(), false, 'Esc sai')
  assert.equal(await seen('.mode-switch'), true)
  assert.match(await page.locator('.status-text').textContent(), /OUVINDO/, 'Esc no cinema não coloca em espera')
  await page.keyboard.press('c')
  await page.waitForTimeout(900)
  await page.keyboard.press('c')
  await page.waitForTimeout(900)
  assert.equal(await fullScreen(), false, 'C sai')
  console.log('ok  modo cinema entra e sai, limpa a tela e não para a escuta')

  const heard = await page.evaluate(async () => {
    const made = []
    const context = window.AudioContext.prototype
    const original = context.createOscillator
    context.createOscillator = function () { made.push(1); return original.call(this) }
    const click = (name) => [...document.querySelectorAll('button')].find((button) => button.textContent.includes(name))?.click()
    click('Professor')
    await new Promise((resolve) => setTimeout(resolve, 150))
    const mode = made.length
    click('Assistente')
    await new Promise((resolve) => setTimeout(resolve, 150))
    context.createOscillator = original
    return { mode, total: made.length }
  })
  assert.ok(heard.mode >= 3, `sons de interface: ${JSON.stringify(heard)}`)
  console.log('ok  sons de interface tocam ao clicar')

  await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((window) => !window.getURL().includes('mini'))?.hide() })
  await page.waitForTimeout(2000)
  const mini = application.windows().find((window) => window.url().includes('mini'))
  assert.ok(mini, 'janela mini')
  await mini.locator('.mini-orb .holo-core-canvas').waitFor({ timeout: 10000 })
  await mini.waitForTimeout(1200)
  assert.equal(await mini.evaluate(() => document.querySelector('.holo-core-canvas').getContext('webgl2').getContextAttributes().alpha), true, 'o mini tem fundo transparente')
  const drawing = () => mini.evaluate(() => new Promise((resolve) => {
    const context = WebGL2RenderingContext.prototype
    const original = context.drawArrays
    let count = 0
    context.drawArrays = function (...args) { count++; return original.apply(this, args) }
    setTimeout(() => { context.drawArrays = original; resolve(count) }, 1500)
  }))
  const visibleFrames = await drawing()
  assert.ok(visibleFrames > 15, `o mini anima: ${visibleFrames} quadros`)
  assert.equal(await mini.locator('.mini-orb .neural-sphere-canvas').count(), 0)
  assert.equal(await mini.evaluate(() => {
    const gl = document.querySelector('.holo-core-canvas').getContext('webgl2')
    const made = gl.getParameter(gl.CURRENT_PROGRAM)
    return gl.getUniform(made, gl.getUniformLocation(made, 'uPlanets[1]'))[3]
  }), 0, 'o mini não tem espaço para os planetas')
  if (out) await mini.screenshot({ path: `${out}/visual-mini.png`, omitBackground: true })
  // Any change of phase would bring it back while the main window is away.
  await application.evaluate(({ BrowserWindow }) => { const orb = BrowserWindow.getAllWindows().find((window) => window.getURL().includes('mini')); orb.showInactive = () => {}; orb.hide() })
  await page.waitForTimeout(800)
  assert.equal(await drawing(), 0, 'escondido, o mini não desenha')
  console.log('ok  mini JARVIS é um buraco negro')
} finally {
  await application.close().catch(() => {})
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(() => {})
}
