const { Notification } = require('electron')

/**
 * Updates from GitHub Releases (the `publish` block in electron-builder.cjs).
 *
 * A new version downloads quietly in the background and installs the next time
 * the user quits JARVIS, so it never restarts in the middle of a conversation.
 * The tray also offers "Reiniciar e atualizar" for anyone who wants it now.
 *
 * The installer is not code-signed, so there is no publisher to check; what
 * protects the download is HTTPS to GitHub and the sha512 in latest.yml.
 */
/** A small request to GitHub; hourly means a new version reaches a JARVIS left open all day. */
const CHECK_EVERY = 60 * 60 * 1000

function startUpdater({ log, icon, onReady }) {
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Info included: "Auto install update on quit" and "Executing: <installer>" are
  // the only trace of whether quitting handed over to the installer. `log` has to
  // write synchronously, because by then the process is about to end.
  const write = (text) => log(`Atualização: ${text}`)
  autoUpdater.logger = { info: write, warn: write, error: write, debug: () => {} }
  autoUpdater.on('update-available', (info) => log(`Baixando a versão ${info.version}.`))
  autoUpdater.on('update-downloaded', (info) => {
    log(`Versão ${info.version} pronta para instalar.`)
    onReady(info.version, () => autoUpdater.quitAndInstall(true, true))
    new Notification({ title: 'JARVIS atualizado', body: `A versão ${info.version} foi baixada. Ao fechar o JARVIS ela é instalada em cerca de 1 minuto: espere antes de abrir de novo. Ou use "Reiniciar e atualizar" na bandeja, que já reabre sozinho.`, icon }).show()
  })
  // Offline, rate-limited or no release yet: none of it should bother the user.
  autoUpdater.on('error', (error) => log(`Atualização indisponível: ${error.message}`))
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 30_000)
  const timer = setInterval(check, CHECK_EVERY)
  return () => clearInterval(timer)
}

/**
 * Whether an update is being installed right now. The installer runs silently
 * for about a minute after JARVIS closes, and opening JARVIS in the middle of it
 * starts an app whose files are being replaced.
 */
function updateInProgress() {
  try {
    const out = require('node:child_process').execFileSync('tasklist', ['/FI', 'IMAGENAME eq JARVIS-Setup*', '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
    return /JARVIS-Setup/i.test(out)
  } catch { return false }
}

module.exports = { startUpdater, updateInProgress }
