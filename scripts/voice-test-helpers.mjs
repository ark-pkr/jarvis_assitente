export const fakeMicrophoneArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']

// Exercise the actual voice handlers using deterministic browser speech events.
export async function installSpeechMock(page) {
  await page.addInitScript(() => {
    class Recognition {
      constructor() { window.__testRecognition = this }
      start() { queueMicrotask(() => this.onstart?.()) }
      abort() { this.onend?.() }
      stop() { this.onend?.() }
      emit(text) {
        const chunks = Array.isArray(text) ? text : [text]
        this.onresult?.({ resultIndex: 0, results: chunks.map((chunk) => Object.assign([{ transcript: chunk }], { isFinal: true })) })
      }
    }
    window.SpeechRecognition = Recognition
    window.webkitSpeechRecognition = Recognition
    const speech = { speaking: false, paused: false, pending: false,
      getVoices: () => [], addEventListener: () => {}, removeEventListener: () => {},
      resume: () => {}, pause: () => {}, cancel: () => { speech.speaking = false; window.__speechCancels = (window.__speechCancels || 0) + 1 },
      speak: (utterance) => {
        speech.speaking = true
        window.__spokenTexts = [...(window.__spokenTexts || []), utterance.text]
        setTimeout(() => utterance.onstart?.({}), 0)
        setTimeout(() => { speech.speaking = false; utterance.onend?.({}) }, window.__speechDuration || 10)
      },
    }
    Object.defineProperty(window, 'speechSynthesis', { value: speech, configurable: true })
  })
}
export async function powerOn(page) {
  await page.getByRole('button', { name: /INICIAR JARVIS/ }).click()
  await page.locator('.status-text').filter({ hasText: /^OUVINDO$/ }).waitFor({ timeout: 25000 })
  await page.waitForFunction(() => Boolean(window.__testRecognition), undefined, { timeout: 25000 })
}
export async function speak(page, text) {
  await page.keyboard.press('Space')
  await page.evaluate((value) => window.__testRecognition.emit(value), text)
}
