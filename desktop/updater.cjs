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
const SIX_HOURS = 6 * 60 * 60 * 1000

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
    new Notification({ title: 'JARVIS atualizado', body: `A versão ${info.version} foi baixada e será instalada quando você sair do JARVIS.`, icon }).show()
  })
  // Offline, rate-limited or no release yet: none of it should bother the user.
  autoUpdater.on('error', (error) => log(`Atualização indisponível: ${error.message}`))
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 30_000)
  const timer = setInterval(check, SIX_HOURS)
  return () => clearInterval(timer)
}

module.exports = { startUpdater }
