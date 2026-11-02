const { contextBridge, ipcRenderer } = require('electron')
// The page gets the payload and an unsubscribe, never the IPC event itself.
const subscribe = (channel, handler) => {
  const listener = (_event, value) => handler(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const origin = process.argv.find((arg) => arg.startsWith('--jarvis-origin='))?.slice('--jarvis-origin='.length)
if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) contextBridge.exposeInMainWorld('jarvisDesktop', Object.freeze({
  bridgeUrl: origin.replace(/^http/, 'ws'),
  settings: () => ipcRenderer.invoke('jarvis:settings'),
  copyText: (text) => ipcRenderer.invoke('jarvis:copy-text', text),
  saveSettings: (values) => ipcRenderer.invoke('jarvis:save-settings', values),
  connectCalendar: (values) => ipcRenderer.invoke('jarvis:calendar-connect', values),
  disconnectCalendar: () => ipcRenderer.invoke('jarvis:calendar-disconnect'),
  activeWindow: () => ipcRenderer.invoke('jarvis:active-window'),
  openExternal: (url) => ipcRenderer.invoke('jarvis:open-external', url),
  voiceIdentityStatus: () => ipcRenderer.invoke('jarvis:voice-identity-status'),
  voiceIdentityMaterial: () => ipcRenderer.invoke('jarvis:voice-identity-material'),
  saveVoiceIdentity: (values) => ipcRenderer.invoke('jarvis:save-voice-identity', values),
  clearVoiceIdentity: () => ipcRenderer.invoke('jarvis:clear-voice-identity'),
  wakeKey: () => ipcRenderer.invoke('jarvis:wake-key'),
  onHotkey: (handler) => subscribe('jarvis:hotkey', handler),
  publishState: (state) => ipcRenderer.send('jarvis:state', state),
  onMiniState: (handler) => subscribe('jarvis:mini-state', handler),
  openMain: () => ipcRenderer.invoke('jarvis:mini-open'),
  requestAttention: () => ipcRenderer.invoke('jarvis:attention'),
  releaseAttention: () => ipcRenderer.invoke('jarvis:attention-release'),
  captureScreen: () => ipcRenderer.invoke('jarvis:capture-screen'),
}))
