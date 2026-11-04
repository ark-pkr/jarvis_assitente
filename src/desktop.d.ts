interface Window {
  jarvisDesktop?: {
    bridgeUrl: string
    settings: () => Promise<{ configured: boolean; model: string; startOnLogin: boolean; contextReminders: boolean; wakeForReminders: boolean; autoActivate: boolean; clapToStart: boolean; miniOrb: boolean; hotkey: string; hotkeyError: string; localWake: boolean; wakeConfigured: boolean; calendarConnected: boolean }>
    connectCalendar: (values: { clientId: string; clientSecret: string }) => Promise<void>
    disconnectCalendar: () => Promise<void>
    activeWindow: () => Promise<string>
    saveSettings: (values: { apiKey?: string; model?: string; startOnLogin?: boolean; contextReminders?: boolean; wakeForReminders?: boolean; autoActivate?: boolean; clapToStart?: boolean; miniOrb?: boolean; hotkey?: string; localWake?: boolean; wakeKey?: string }) => Promise<void>
    openExternal: (url: string) => Promise<void>
    copyText: (text: string) => Promise<void>
    setFullScreen: (on: boolean) => Promise<void>
    voiceIdentityStatus: () => Promise<{ configured: boolean; enrolled: boolean }>
    voiceIdentityMaterial: () => Promise<{ accessKey: string; profile: string } | null>
    saveVoiceIdentity: (values: { accessKey: string; profile: string }) => Promise<void>
    clearVoiceIdentity: () => Promise<void>
    wakeKey: () => Promise<string>
    onHotkey: (handler: () => void) => () => void
    publishState: (state: { phase: string; level: number; caption: string; looking: string }) => void
    onMiniState: (handler: (state: { phase: string; level: number; caption: string; looking: string }) => void) => () => void
    onMiniVisible: (handler: (visible: boolean) => void) => () => void
    miniMouse: (inside: boolean) => Promise<void>
    openMain: () => Promise<void>
    requestAttention: () => Promise<void>
    releaseAttention: () => Promise<void>
    captureScreen: () => Promise<{ data: string; mimeType: string }>
  }
}
declare const __JARVIS_VERSION__: string
declare const __JARVIS_BRIDGE_PORT__: string
