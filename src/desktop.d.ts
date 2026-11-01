interface Window {
  jarvisDesktop?: {
    bridgeUrl: string
    settings: () => Promise<{ configured: boolean; model: string; startOnLogin: boolean; contextReminders: boolean }>
    saveSettings: (values: { apiKey?: string; model?: string; startOnLogin?: boolean; contextReminders?: boolean }) => Promise<void>
    openExternal: (url: string) => Promise<void>
    voiceIdentityStatus: () => Promise<{ configured: boolean; enrolled: boolean }>
    voiceIdentityMaterial: () => Promise<{ accessKey: string; profile: string } | null>
    saveVoiceIdentity: (values: { accessKey: string; profile: string }) => Promise<void>
    clearVoiceIdentity: () => Promise<void>
  }
}
declare const __JARVIS_VERSION__: string
