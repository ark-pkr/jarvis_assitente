const { app, BrowserWindow, Menu, Tray, nativeImage, session, ipcMain, clipboard, dialog, safeStorage, utilityProcess, Notification, shell, globalShortcut, screen, desktopCapturer } = require('electron')
const { connectCalendar, revokeCalendar } = require('./calendar-auth.cjs')
const fs = require('node:fs/promises')
const { appendFileSync } = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { parseEnv } = require('node:util')
const { getActiveWindow } = require('./active-window.cjs')
const { createReminderTask, REMINDER_ARG } = require('./reminder-task.cjs')
const { startUpdater, updateInProgress } = require('./updater.cjs')

app.setName('JARVIS')
app.setPath('userData', path.join(app.getPath('appData'), 'JARVIS'))
// Windows names a notification after the Start Menu shortcut carrying this id.
// A development run under the same id left an "Electron" shortcut behind that
// won over the installed JARVIS one, so development gets an id of its own.
app.setAppUserModelId(app.isPackaged ? 'br.jarvis.assistente' : 'br.jarvis.assistente.dev')
// "Ativar ao abrir" has no click to unlock audio with, and an assistant that
// starts by itself has to be able to speak. This window only ever loads our page.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (process.env.JARVIS_DESKTOP_TEST_DATA) app.setPath('userData', process.env.JARVIS_DESKTOP_TEST_DATA)
if (process.env.JARVIS_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.JARVIS_DEBUG_PORT)
const root = path.resolve(__dirname, '..')
const directory = app.getPath('userData')
const data = path.join(directory, 'dados')
const configFile = path.join(directory, 'desktop-settings.json')
const token = randomBytes(32).toString('hex')
const DEFAULT_HOTKEY = 'Control+Alt+J'
const LOGIN_ARGS = ['--segundo-plano']
const MINI_SIZE = { width: 180, height: 148 }
let win, mini, tray, worker, origin, config = {}, quitting = false, restarting = false, notificationTimer, contextTimer, contextWarningShown = false
let hotkeyError = '', jarvisPhase = 'offline', attentionReturn = null, stopUpdater = null
const log = (text) => { void fs.appendFile(path.join(directory, 'desktop.log'), `${new Date().toISOString()} ${text}\n`).catch(() => {}) }
/** For moments the process may end before an async write lands: quitting, and handing over to the installer. */
const logNow = (text) => { try { appendFileSync(path.join(directory, 'desktop.log'), `${new Date().toISOString()} ${text}\n`) } catch { /* Never block quitting over a log line. */ } }
const decrypted = (value) => value && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, 'base64')) : ''
const calendarEnv = () => config.encryptedCalendar ? { JARVIS_GOOGLE_CLIENT_ID: config.calendarClientId, JARVIS_GOOGLE_CLIENT_SECRET: decrypted(config.encryptedCalendarSecret), JARVIS_GOOGLE_REFRESH_TOKEN: decrypted(config.encryptedCalendar) } : {}
const getKey = () => config.encryptedKey ? safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64')) : ''
const persist = () => fs.writeFile(configFile, JSON.stringify(config, null, 2))
const trusted = (event) => { if (new URL(event.senderFrame.url).origin !== origin || event.sender !== win?.webContents) throw new Error('Pedido recusado.') }
async function restartBridge() {
  restarting = true
  if (worker) await new Promise((resolve) => { worker.once('exit', resolve); worker.kill(); setTimeout(resolve, 3000) })
  try { await startBridge() } finally { restarting = false }
  setTimeout(() => { if (!quitting && !win.isDestroyed()) void win.reload() }, 250)
}
async function startBridge() {
  const port = new URL(origin).port
  worker = utilityProcess.fork(path.join(root, 'bridge', 'server.mjs'), [], {
    cwd: data, stdio: 'pipe', serviceName: 'JARVIS - assistente local',
    env: { ...process.env, GEMINI_API_KEY: getKey(), JARVIS_PROVIDER: 'gemini', JARVIS_MODEL: config.model || 'gemini-3.5-flash',
      JARVIS_DESKTOP: '1', JARVIS_BRIDGE_PORT: port, JARVIS_ALLOWED_ORIGINS: origin,
      JARVIS_SESSION_TOKEN: token, JARVIS_DATA_DIR: data, JARVIS_STATIC_DIR: path.join(root, 'dist'), JARVIS_VERSION: app.getVersion(),
      // Outside the app's own folder, so that uninstalling or wiping it does not take the copies too.
      ...(process.env.JARVIS_DESKTOP_TEST_DATA ? {} : { JARVIS_BACKUP_DIR: path.join(app.getPath('documents'), 'JARVIS Backups') }), ...calendarEnv() },
  })
  worker.stdout?.on('data', (text) => log(text.toString()))
  worker.stderr?.on('data', (text) => log(text.toString()))
  const currentWorker = worker
  worker.on('exit', (code) => { if (worker === currentWorker && !quitting && !restarting) { log(`Serviço encerrado: ${code}`); void dialog.showMessageBox({ type: 'error', title: 'JARVIS', message: 'O serviço local parou. Feche o JARVIS e abra novamente.', detail: `Código: ${code}. Logs: ${directory}` }) } })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(origin + '/health', { headers: { cookie: `jarvis_session=${token}` }, signal: AbortSignal.timeout(1000) }); if (response.ok) return }
    catch { /* Wait for the local service. */ }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('O serviço local não iniciou. Consulte desktop.log na pasta de dados do JARVIS.')
}
function show() { if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus() } }
const away = () => !win?.isVisible() || win.isMinimized() || !win.isFocused()
/** The orb stands in for the window, and only while there is something to show. */
function syncMini() {
  if (quitting || !mini) return
  if (away() && config.miniOrb !== false && jarvisPhase !== 'offline' && jarvisPhase !== 'boot') { if (!mini.isVisible()) mini.showInactive() }
  else if (mini.isVisible()) mini.hide()
}
const decryptOptional = (value) => value && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, 'base64')) : ''
/** The wake word can use its own key, or the one already saved for voice identity. */
const wakeKey = () => decryptOptional(config.encryptedWakeKey) || decryptOptional(config.encryptedVoiceAccessKey)
const loginSettings = () => app.getLoginItemSettings({ path: process.execPath, args: LOGIN_ARGS }).openAtLogin || app.getLoginItemSettings().openAtLogin
function registerHotkey() {
  globalShortcut.unregisterAll(); hotkeyError = ''
  const hotkey = config.hotkey || DEFAULT_HOTKEY
  let registered = false
  try { registered = globalShortcut.register(hotkey, () => win?.webContents.send('jarvis:hotkey')) } catch { /* Reported below. */ }
  if (!registered) hotkeyError = `O atalho ${hotkey} não está disponível. Outro programa pode estar usando.`
}
async function createMini() {
  const { workArea } = screen.getPrimaryDisplay()
  mini = new BrowserWindow({ ...MINI_SIZE, x: workArea.x + workArea.width - MINI_SIZE.width - 12, y: workArea.y + workArea.height - MINI_SIZE.height - 12,
    title: 'JARVIS', frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
      partition: 'persist:jarvis-app', backgroundThrottling: false, additionalArguments: [`--jarvis-origin=${origin}`] } })
  // It never throttles, so nothing but this stops it drawing while nobody can see it.
  for (const change of ['show', 'hide']) mini.on(change, () => mini?.webContents.send('jarvis:mini-visible', change === 'show'))
  mini.setAlwaysOnTop(true, 'floating')
  // Only the hole itself answers the mouse; a click anywhere else goes to whatever is behind.
  mini.setIgnoreMouseEvents(true, { forward: true })
  // Its own pixels must never end up in a screen capture sent to the model.
  mini.setContentProtection(true)
  mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mini.webContents.on('will-navigate', (event) => event.preventDefault())
  await mini.loadURL(origin + '/?mini=1')
}
async function createWindow() {
  win = new BrowserWindow({ title: 'J.A.R.V.I.S.', width: 1280, height: 900, minWidth: 800, minHeight: 600, backgroundColor: '#01060c', icon: path.join(__dirname, 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
      partition: 'persist:jarvis-app', backgroundThrottling: false, additionalArguments: [`--jarvis-origin=${origin}`] } })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault() })
  // The X means quit: window, mini JARVIS, microphone and the local service all go,
  // exactly like "Sair do JARVIS" in the tray (and a downloaded update installs).
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); app.quit() } })
  for (const change of ['hide', 'show', 'minimize', 'restore', 'focus', 'blur']) win.on(change, syncMini)
  // Logging in shouldn't throw a window at anyone who asked him to wake up alone.
  // Nor at anyone a scheduled reminder started him for: that one only wants the notification.
  const background = (process.argv.includes(LOGIN_ARGS[0]) && config.autoActivate === true) || process.argv.includes(REMINDER_ARG)
  win.once('ready-to-show', () => { if (!background) show() })
  try { await win.loadURL(origin) }
  catch (error) {
    // A user/settings reload may replace the initial navigation after the UI
    // is already visible. Keep that trusted navigation from aborting boot.
    if (error.code !== 'ERR_ABORTED' || !win.webContents.getURL().startsWith(origin + '/')) throw error
  }
}
/** This version's entry from CHANGELOG.md, written next to this file when the app is packaged. */
async function showNews(fromNotice = false) {
  const notes = (await fs.readFile(path.join(__dirname, 'novidades.txt'), 'utf8').catch(() => '')).trim()
  const version = app.getVersion()
  if (!notes) { if (!fromNotice) void dialog.showMessageBox({ type: 'info', title: 'JARVIS', message: `JARVIS ${version}`, detail: 'Não há notas para esta versão.' }); return }
  if (fromNotice) {
    const first = notes.split('\n').find((line) => line.startsWith('•'))?.replace(/^•\s*/, '') ?? notes
    const notice = new Notification({ title: `JARVIS ${version}: o que mudou`, body: first.length > 180 ? `${first.slice(0, 177)}...` : first, icon: path.join(__dirname, 'icon.png') })
    notice.on('click', () => void showNews())
    notice.show()
    return
  }
  void dialog.showMessageBox(win?.isVisible() ? win : undefined, { type: 'info', title: 'JARVIS', message: `O que mudou no JARVIS ${version}`, detail: notes, buttons: ['OK'] })
}
async function boot() {
  if (app.isPackaged && updateInProgress()) {
    logNow('Aberto durante a instalação de uma atualização; encerrando.')
    await dialog.showMessageBox({ type: 'info', title: 'JARVIS', message: 'O JARVIS está sendo atualizado.', detail: 'A instalação termina em cerca de 1 minuto. Abra o JARVIS de novo depois disso.', buttons: ['OK'] })
    return app.quit()
  }
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
    // Opting in to starting alone is the answer to this question; a dialog at
    // login, with no window behind it, would stop the start it was asked for.
    if (!camera && (config.autoActivate === true || config.clapToStart === true)) return callback(true)
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
  // The page never gets the clipboard permission, which would also let it read.
  ipcMain.handle('jarvis:copy-text', (event, text) => { trusted(event); if (typeof text === 'string' && text.length <= 200000) clipboard.writeText(text) })
  ipcMain.handle('jarvis:fullscreen', (event, on) => { trusted(event); win.setFullScreen(on === true) })
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
  ipcMain.handle('jarvis:settings', (event) => { trusted(event); return { configured: Boolean(config.encryptedKey), model: config.model || 'gemini-3.5-flash', startOnLogin: loginSettings(), contextReminders: config.contextReminders === true, wakeForReminders: config.wakeForReminders === true,
    autoActivate: config.autoActivate === true, clapToStart: config.clapToStart === true, miniOrb: config.miniOrb !== false, hotkey: config.hotkey || DEFAULT_HOTKEY, hotkeyError,
    localWake: config.localWake !== false, wakeConfigured: Boolean(config.encryptedWakeKey || config.encryptedVoiceAccessKey), calendarConnected: Boolean(config.encryptedCalendar) } })
  ipcMain.handle('jarvis:wake-key', (event) => { trusted(event); return config.localWake === false ? '' : wakeKey() })
  ipcMain.on('jarvis:state', (event, state) => {
    // The page keeps publishing while the app quits, and throwing in here puts up
    // a native error box that blocks the quit behind it.
    if (quitting || event.sender !== win?.webContents || !state || typeof state.phase !== 'string') return
    if (state.phase !== jarvisPhase) { jarvisPhase = state.phase; syncMini() }
    if (mini?.isVisible()) mini.webContents.send('jarvis:mini-state', { phase: state.phase, level: Number(state.level) || 0, caption: String(state.caption ?? '').slice(0, 120), looking: String(state.looking ?? '').slice(0, 120) })
  })
  ipcMain.handle('jarvis:mini-mouse', (event, inside) => { if (event.sender === mini?.webContents) mini.setIgnoreMouseEvents(inside !== true, { forward: true }) })
  ipcMain.handle('jarvis:mini-open', (event) => { if (event.sender === mini?.webContents) show() })
  // A confirmation can arrive while he is in the tray. Bring the window up for
  // it, and put things back afterwards the way they were.
  ipcMain.handle('jarvis:attention', (event) => {
    trusted(event)
    if (!attentionReturn && (!win.isVisible() || win.isMinimized())) attentionReturn = win.isVisible() ? 'minimize' : 'hide'
    show()
  })
  ipcMain.handle('jarvis:attention-release', (event) => {
    trusted(event)
    const back = attentionReturn; attentionReturn = null
    if (back === 'hide') win.hide(); else if (back === 'minimize') win.minimize()
  })
  ipcMain.handle('jarvis:capture-screen', async (event) => {
    trusted(event)
    const wasVisible = win.isVisible() && !win.isMinimized()
    // Asking permission put our window on top of whatever they wanted seen.
    if (wasVisible) win.hide()
    mini?.hide()
    await new Promise((resolve) => setTimeout(resolve, 280))
    try {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      const scale = Math.min(display.scaleFactor, 1920 / display.size.width)
      const thumbnailSize = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
      const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
      if (!source || source.thumbnail.isEmpty()) throw new Error('O Windows não entregou a imagem da tela.')
      return { data: source.thumbnail.toJPEG(82).toString('base64'), mimeType: 'image/jpeg' }
    } finally { if (wasVisible) win.showInactive(); syncMini() }
  })
  ipcMain.handle('jarvis:save-settings', async (event, input) => {
    trusted(event)
    if (!input || typeof input !== 'object') throw new Error('Configuração inválida.')
    if (input.apiKey) {
      if (typeof input.apiKey !== 'string' || input.apiKey.length < 15 || input.apiKey.length > 200 || !safeStorage.isEncryptionAvailable()) throw new Error('Chave inválida ou proteção de credenciais indisponível.')
      config.encryptedKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64')
    }
    if (input.model !== undefined) { if (!/^gemini-[a-zA-Z0-9.-]{1,70}$/.test(input.model)) throw new Error('Modelo inválido.'); config.model = input.model }
    if (typeof input.startOnLogin === 'boolean' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: input.startOnLogin, path: process.execPath, args: LOGIN_ARGS })
    if (typeof input.wakeForReminders === 'boolean') config.wakeForReminders = input.wakeForReminders
    if (typeof input.contextReminders === 'boolean') config.contextReminders = input.contextReminders
    for (const name of ['autoActivate', 'clapToStart', 'miniOrb', 'localWake']) if (typeof input[name] === 'boolean') config[name] = input[name]
    if (input.wakeKey) {
      if (typeof input.wakeKey !== 'string' || input.wakeKey.length < 20 || input.wakeKey.length > 200 || !safeStorage.isEncryptionAvailable()) throw new Error('Chave Picovoice inválida ou proteção de credenciais indisponível.')
      config.encryptedWakeKey = safeStorage.encryptString(input.wakeKey.trim()).toString('base64')
    }
    if (input.hotkey !== undefined) { if (typeof input.hotkey !== 'string' || !/^[A-Za-z0-9]+(\+[A-Za-z0-9]+)+$/.test(input.hotkey) || input.hotkey.length > 40) throw new Error('Atalho inválido.'); config.hotkey = input.hotkey; registerHotkey() }
    await persist()
    await restartBridge()
  })
  ipcMain.handle('jarvis:calendar-connect', async (event, input) => {
    trusted(event)
    const clientId = String(input?.clientId ?? '').trim()
    const clientSecret = String(input?.clientSecret ?? '').trim()
    if (!/^[\w.-]{10,200}\.apps\.googleusercontent\.com$/.test(clientId) || clientSecret.length < 8 || clientSecret.length > 200) throw new Error('Confira o ID e a chave do cliente do Google.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('A proteção de credenciais do Windows não está disponível.')
    const refreshToken = await connectCalendar({ clientId, clientSecret, open: (url) => shell.openExternal(url) })
    config.calendarClientId = clientId
    config.encryptedCalendarSecret = safeStorage.encryptString(clientSecret).toString('base64')
    config.encryptedCalendar = safeStorage.encryptString(refreshToken).toString('base64')
    await persist()
    await restartBridge()
  })
  ipcMain.handle('jarvis:active-window', async (event) => {
    trusted(event)
    const active = await Promise.race([getActiveWindow(), new Promise((resolve) => setTimeout(resolve, 1500, null))])
    // His own window says nothing about what "isso" means.
    return active && !win?.isFocused() ? `${active.process}: ${active.title}` : ''
  })
  ipcMain.handle('jarvis:calendar-disconnect', async (event) => {
    trusted(event)
    const refreshToken = decrypted(config.encryptedCalendar)
    if (refreshToken) await revokeCalendar(refreshToken)
    delete config.calendarClientId; delete config.encryptedCalendarSecret; delete config.encryptedCalendar
    await persist()
    await restartBridge()
  })
  await startBridge(); await createWindow()
  registerHotkey()
  await createMini()
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24, height: 24 }))
  tray.setToolTip('JARVIS - assistente pessoal')
  const trayMenu = (update) => Menu.buildFromTemplate([{ label: 'Abrir JARVIS', click: show }, { label: 'O que mudou nesta versão', click: () => void showNews() }, ...(update ? [{ label: `Reiniciar e atualizar para ${update.version}`, click: update.install }] : []), { label: 'Sair do JARVIS', click: () => app.quit() }])
  tray.setContextMenu(trayMenu())
  // Once per new version: the first start after an update says what changed.
  if (config.lastVersion !== app.getVersion()) {
    const updated = Boolean(config.lastVersion)
    config.lastVersion = app.getVersion(); await persist()
    if (updated && app.isPackaged) void showNews(true)
  }
  if (app.isPackaged && !process.env.JARVIS_DESKTOP_TEST_DATA) stopUpdater = startUpdater({ log: logNow, icon: path.join(__dirname, 'icon.png'), onReady: (version, install) => tray?.setContextMenu(trayMenu({ version, install })) })
  tray.on('double-click', show)
  const notified = new Set()
  // Only an installed copy may leave a task behind in the Windows scheduler.
  const scheduleReminder = app.isPackaged && !process.env.JARVIS_DESKTOP_TEST_DATA ? createReminderTask({ exe: process.execPath, log, wake: () => config.wakeForReminders === true }) : null
  notificationTimer = setInterval(async () => {
    try {
      const response = await fetch(origin + '/assistant/alerts', { headers: { cookie: `jarvis_session=${token}` }, signal: AbortSignal.timeout(3000) })
      const state = await response.json()
      for (const item of state.notifications) if (!notified.has(item.id)) {
        notified.add(item.id)
        const notice = new Notification({ title: 'Lembrete do JARVIS', body: item.title, icon: path.join(__dirname, 'icon.png') })
        notice.on('click', show)
        notice.show()
      }
      void scheduleReminder?.(state.next)
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
  if (app.isPackaged && !process.env.JARVIS_DESKTOP_TEST_DATA && !config.loginConfigured) { app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: LOGIN_ARGS }); config.loginConfigured = true; await persist() }
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  // A scheduled reminder firing while he is already open must not pull the window up.
  app.on('second-instance', (event, argv) => { if (!argv.includes(REMINDER_ARG)) show() })
  app.on('activate', show)
  app.on('before-quit', () => { if (!quitting) logNow('Saindo do JARVIS.'); quitting = true; clearInterval(notificationTimer); clearInterval(contextTimer); stopUpdater?.(); globalShortcut.unregisterAll(); const orb = mini; mini = null; orb?.destroy(); worker?.kill(); tray?.destroy() })
  app.on('window-all-closed', () => { if (quitting) app.quit() })
  app.on('quit', (event, exitCode) => logNow(`JARVIS encerrado (código ${exitCode}).`))
  app.whenReady().then(() => { logNow(`JARVIS ${app.getVersion()} iniciado${process.argv.some((arg) => arg.startsWith('--')) ? ` (${process.argv.slice(1).filter((arg) => arg.startsWith('--')).join(' ')})` : ''}.`); return boot() }).catch((error) => { log(error.message); dialog.showErrorBox('JARVIS não iniciou', error.message); app.quit() })
}
