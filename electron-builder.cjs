module.exports = {
  appId: 'br.jarvis.assistente', productName: 'JARVIS',
  directories: { app: 'desktop-app', output: 'release' },
  // One archive instead of ~3,400 loose files: installing an update goes from about
  // a minute to seconds. What another program has to open stays outside it.
  asar: true, npmRebuild: false,
  asarUnpack: ['bridge/*.ps1', 'desktop/icon.png', '**/*.node', 'licenses/**'],
  files: ['desktop/**/*', 'bridge/**/*', 'dist/**/*', 'licenses/**/*', 'package.json', '!**/*.test.mjs', '!**/*.map', '!**/.env*', '!**/.jarvis-data/**', '!node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'],
  // Where electron-updater looks for new versions. electron-builder itself never
  // publishes (--publish never): scripts/release.mjs uploads in order, see there.
  publish: [{ provider: 'github', owner: 'ark-pkr', repo: 'jarvis_assitente', releaseType: 'release' }],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'desktop/icon.ico', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'JARVIS', artifactName: 'JARVIS-Setup-${version}-${arch}.${ext}', installerLanguages: ['pt_BR'], language: '1046' },
}
