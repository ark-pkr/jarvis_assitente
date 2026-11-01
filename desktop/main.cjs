const { app, BrowserWindow, Menu, Tray, nativeImage, session, ipcMain, dialog, safeStorage, utilityProcess, Notification, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { parseEnv } = require('node:util')
const { getActiveWindow } = require('./active-window.cjs')

app.setName('JARVIS')
app.setPath('userData', path.join(app.getPath('appData'), 'JARVIS'))
app.setAppUserModelId('br.jarvis.assistente')
if (process.env.JARVIS_DESKTOP_TEST_DATA) app.setPath('userData', process.env.JARVIS_DESKTOP_TEST_DATA)
if (process.env.JARVIS_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.JARVIS_DEBUG_PORT)
const root = path.resolve(__dirname, '..')
const directory = app.getPath('userData')
const data = path.join(directory, 'dados')
const configFile = path.join(directory, 'desktop-settings.json')
const token = randomBytes(32).toString('hex')
let win, tray, worker, origin, config = {}, quitting = false, restarting = false, notificationTimer, contextTimer, contextWarningShown = false
const log = (text) => { void fs.appendFile(path.join(directory, 'desktop.log'), `${new Date().toISOString()} ${text}\n`).catch(() => {}) }
const getKey = () => config.encryptedKey ? safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64')) : ''
const persist = () => fs.writeFile(configFile, JSON.stringify(config, null, 2))
const trusted = (event) => { if (new URL(event.senderFrame.url).origin !== origin || event.sender !== win?.webContents) throw new Error('Pedido recusado.') }
async function startBridge() {
  const port = new URL(origin).port
  worker = utilityProcess.fork(path.join(root, 'bridge', 'server.mjs'), [], {
    cwd: data, stdio: 'pipe', serviceName: 'JARVIS - assistente local',
    env: { ...process.env, GEMINI_API_KEY: getKey(), JARVIS_PROVIDER: 'gemini', JARVIS_MODEL: config.model || 'gemini-3.5-flash',
      JARVIS_DESKTOP: '1', JARVIS_BRIDGE_PORT: port, JARVIS_ALLOWED_ORIGINS: origin,
      JARVIS_SESSION_TOKEN: token, JARVIS_DATA_DIR: data, JARVIS_STATIC_DIR: path.join(root, 'dist') },
  })
  worker.stdout?.on('data', (text) => log(text.toString()))
  worker.stderr?.on('data', (text) => log(text.toString()))
  const currentWorker = worker
  worker.on('exit', (code) => { if (worker === currentWorker && !quitting && !restarting) { log(`Serviço encerrado: ${code}`); void dialog.showMessageBox({ type: 'error', title: 'JARVIS', message: 'O serviço local parou. Feche o JARVIS pelo menu da bandeja e abra novamente.', detail: `Código: ${code}. Logs: ${directory}` }) } })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(origin + '/health', { headers: { cookie: `jarvis_session=${token}` }, signal: AbortSignal.timeout(1000) }); if (response.ok) return }
    catch { /* Wait for the local service. */ }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('O serviço local não iniciou. Consulte desktop.log na pasta de dados do JARVIS.')
}
function show() { if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus() } }
async function createWindow() {
  win = new BrowserWindow({ title: 'J.A.R.V.I.S.', width: 1280, height: 900, minWidth: 800, minHeight: 600, backgroundColor: '#01060c', icon: path.join(__dirname, 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
      partition: 'persist:jarvis-app', backgroundThrottling: false, additionalArguments: [`--jarvis-origin=${origin}`] } })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault() })
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); win.hide() } })
  win.once('ready-to-show', show)
  try { await win.loadURL(origin) }
  catch (error) {
    // A user/settings reload may replace the initial navigation after the UI
    // is already visible. Keep that trusted navigation from aborting boot.
    if (error.code !== 'ERR_ABORTED' || !win.webContents.getURL().startsWith(origin + '/')) throw error
  }
}
async function boot() {
  await fs.mkdir(data, { recursive: true })
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!config.encryptedKey && process.env.JARVIS_IMPORT_ENV) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção de credenciais do Windows indisponível.')
    const values = parseEnv(await fs.readFile(process.env.JARVIS_IMPORT_ENV, 'utf8'))
    if (values.GEMINI_API_KEY) { config.encryptedKey = safeStorage.encryptString(values.GEMINI_API_KEY).toString('base64'); config.model = values.JARVIS_MODEL || 'gemini-3.5-flash'; await persist() }
  }
  if (process.env.JARVIS_IMPORT_DATA && !config.dataImported) {
    await fs.cp(process.env.JARVIS_IMPORT_DATA, data, { recursive: true, force: false, errorOnExist: false, filter: (source) => !/browser-profile|launcher\.pid|\.log$|integrations/.test(source) })
    config.dataImported = true; await persist()
  }
  const port = Number(process.env.JARVIS_DESKTOP_PORT || 18787)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta local inválida.')
  origin = `http://127.0.0.1:${port}`
  const ownSession = session.fromPartition('persist:jarvis-app')
  await ownSession.cookies.set({ url: origin, name: 'jarvis_session', value: token, httpOnly: true, sameSite: 'strict', path: '/' })
  ownSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => requestingOrigin === origin && ['media', 'notifications'].includes(permission) && contents === win?.webContents)
  ownSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (contents !== win?.webContents || new URL(details.requestingUrl || origin).origin !== origin || !['media', 'notifications'].includes(permission)) return callback(false)
    if (permission === 'notifications') return callback(true)
    const camera = details.mediaTypes?.includes('video')
    const result = await dialog.showMessageBox(win, { type: 'question', title: 'Permissão do JARVIS', message: camera ? 'Permitir acesso à câmera?' : 'Permitir acesso ao microfone para conversar com o JARVIS?', detail: 'A fala capturada será enviada ao Gemini para transcrição. Você pode colocar o JARVIS em espera com Esc.', buttons: ['Permitir', 'Agora não'], defaultId: 0, cancelId: 1 })
    callback(result.response === 0)
  })
  ipcMain.handle('jarvis:open-external', async (event, value) => {
    trusted(event)
    if (typeof value !== 'string') throw new Error('Link inválido.')
    let url
    try { url = new URL(value) } catch { throw new Error('Link inválido.') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Somente links HTTP ou HTTPS podem ser abertos.')
    await shell.openExternal(url.href)
  })
  ipcMain.handle('jarvis:voice-identity-status', (event) => {
    trusted(event)
    return { configured: Boolean(config.encryptedVoiceAccessKey), enrolled: Boolean(config.encryptedVoiceProfile) }
  })
  ipcMain.handle('jarvis:voice-identity-material', (event) => {
    trusted(event)
    if (!config.encryptedVoiceAccessKey || !config.encryptedVoiceProfile) return null
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção local de voz indisponível.')
    return {
      accessKey: safeStorage.decryptString(Buffer.from(config.encryptedVoiceAccessKey, 'base64')),
      profile: safeStorage.decryptString(Buffer.from(config.encryptedVoiceProfile, 'base64')),
    }
  })
  ipcMain.handle('jarvis:save-voice-identity', async (event, input) => {
    trusted(event)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção local de voz indisponível.')
    if (!input || typeof input.accessKey !== 'string' || input.accessKey.length < 20 || input.accessKey.length > 200
      || typeof input.profile !== 'string' || input.profile.length < 32 || input.profile.length > 100_000
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.profile)) throw new Error('Cadastro de voz inválido.')
    const profile = Buffer.from(input.profile, 'base64')
    if (!profile.length || profile.toString('base64') !== input.profile) throw new Error('Perfil de voz inválido.')
    config.encryptedVoiceAccessKey = safeStorage.encryptString(input.accessKey.trim()).toString('base64')
    config.encryptedVoiceProfile = safeStorage.encryptString(input.profile).toString('base64')
    await persist()
  })
  ipcMain.handle('jarvis:clear-voice-identity', async (event) => {
    trusted(event)
    delete config.encryptedVoiceAccessKey
    delete config.encryptedVoiceProfile
    await persist()
  })
  ipcMain.handle('jarvis:settings', (event) => { trusted(event); return { configured: Boolean(config.encryptedKey), model: config.model || 'gemini-3.5-flash', startOnLogin: app.getLoginItemSettings().openAtLogin, contextReminders: config.contextReminders === true } })
  ipcMain.handle('jarvis:save-settings', async (event, input) => {
    trusted(event)
    if (!input || typeof input !== 'object') throw new Error('Configuração inválida.')
    if (input.apiKey) {
      if (typeof input.apiKey !== 'string' || input.apiKey.length < 15 || input.apiKey.length > 200 || !safeStorage.isEncryptionAvailable()) throw new Error('Chave inválida ou proteção de credenciais indisponível.')
      config.encryptedKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64')
    }
    if (input.model !== undefined) { if (!/^gemini-[a-zA-Z0-9.-]{1,70}$/.test(input.model)) throw new Error('Modelo inválido.'); config.model = input.model }
    if (typeof input.startOnLogin === 'boolean' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: input.startOnLogin, path: process.execPath })
    if (typeof input.contextReminders === 'boolean') config.contextReminders = input.contextReminders
    await persist()
    restarting = true
    if (worker) await new Promise((resolve) => { worker.once('exit', resolve); worker.kill(); setTimeout(resolve, 3000) })
    try { await startBridge() } finally { restarting = false }
    setTimeout(() => { void win.reload() }, 250)
  })
  await startBridge(); await createWindow()
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24, height: 24 }))
  tray.setToolTip('JARVIS - assistente pessoal')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir JARVIS', click: show }, { label: 'Sair do JARVIS', click: () => app.quit() }]))
  tray.on('double-click', show)
  const notified = new Set()
  notificationTimer = setInterval(async () => {
    try {
      const response = await fetch(origin + '/assistant/alerts', { headers: { cookie: `jarvis_session=${token}` }, signal: AbortSignal.timeout(3000) })
      const state = await response.json()
      for (const item of state.notifications) if (!notified.has(item.id)) { notified.add(item.id); new Notification({ title: 'Lembrete do JARVIS', body: item.title, icon: path.join(__dirname, 'icon.png') }).show() }
    } catch { /* Keep the app usable while restarting the bridge. */ }
  }, 5000)
  contextTimer = setInterval(async () => {
    if (config.contextReminders !== true) return
    try {
      const active = await getActiveWindow()
      if (!active) return
      const response = await fetch(origin + '/assistant/context', {
        method: 'POST',
        headers: { cookie: `jarvis_session=${token}`, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ active: `${active.process} ${active.title}` }),
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error(`O serviço local respondeu ${response.status}.`)
      const result = await response.json()
      if (result.triggered?.length) log(`Lembrete contextual disparado: ${result.triggered.length} registro(s); janela ativa não armazenada.`)
      contextWarningShown = false
    } catch (error) {
      if (!contextWarningShown) log(`Lembretes contextuais temporariamente indisponíveis: ${error.message}`)
      contextWarningShown = true
    }
  }, 20000)
  if (app.isPackaged && !process.env.JARVIS_DESKTOP_TEST_DATA && !config.loginConfigured) { app.setLoginItemSettings({ openAtLogin: true, path: process.execPath }); config.loginConfigured = true; await persist() }
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', show)
  app.on('activate', show)
  app.on('before-quit', () => { quitting = true; clearInterval(notificationTimer); clearInterval(contextTimer); worker?.kill(); tray?.destroy() })
  app.on('window-all-closed', () => { if (quitting) app.quit() })
  app.whenReady().then(boot).catch((error) => { log(error.message); dialog.showErrorBox('JARVIS não iniciou', error.message); app.quit() })
}
