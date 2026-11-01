const { contextBridge, ipcRenderer } = require('electron')
const origin = process.argv.find((arg) => arg.startsWith('--jarvis-origin='))?.slice('--jarvis-origin='.length)
if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) contextBridge.exposeInMainWorld('jarvisDesktop', Object.freeze({
  bridgeUrl: origin.replace(/^http/, 'ws'),
  settings: () => ipcRenderer.invoke('jarvis:settings'),
  saveSettings: (values) => ipcRenderer.invoke('jarvis:save-settings', values),
  openExternal: (url) => ipcRenderer.invoke('jarvis:open-external', url),
  voiceIdentityStatus: () => ipcRenderer.invoke('jarvis:voice-identity-status'),
  voiceIdentityMaterial: () => ipcRenderer.invoke('jarvis:voice-identity-material'),
  saveVoiceIdentity: (values) => ipcRenderer.invoke('jarvis:save-voice-identity', values),
  clearVoiceIdentity: () => ipcRenderer.invoke('jarvis:clear-voice-identity'),
}))
