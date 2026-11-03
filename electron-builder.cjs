module.exports = {
  appId: 'br.jarvis.assistente', productName: 'JARVIS',
  directories: { app: 'desktop-app', output: 'release' },
  asar: false, npmRebuild: false,
  files: ['desktop/**/*', 'bridge/**/*', 'dist/**/*', 'licenses/**/*', 'package.json', '!**/*.test.mjs', '!**/*.map', '!**/.env*', '!**/.jarvis-data/**', '!node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'],
  // Where electron-updater looks for new versions. `npm run desktop:release` uploads there.
  publish: [{ provider: 'github', owner: 'ark-pkr', repo: 'jarvis_assitente', releaseType: 'release' }],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'desktop/icon.ico', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'JARVIS', artifactName: 'JARVIS-Setup-${version}-${arch}.${ext}', installerLanguages: ['pt_BR'], language: '1046' },
}
