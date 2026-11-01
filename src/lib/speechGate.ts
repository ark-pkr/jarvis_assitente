export class SpeechGate {
  floor = 0.0025
  threshold = 0.006
  speaking = false
  calibrated = false
  private baseline: number[] = []
  private calibratedMs = 0
  private armed = 0
  private quiet = 0
  private voiced = 0
  private elapsed = 0
  reset() { this.speaking = false; this.armed = 0; this.quiet = 0; this.voiced = 0; this.elapsed = 0 }
  feed(energy: number, ms: number, pauseMs: number): 'start' | 'end' | 'discard' | null {
    if (!this.calibrated) {
      this.baseline.push(energy); this.calibratedMs += ms
      if (this.calibratedMs >= 450) {
        const sorted = this.baseline.sort((a, b) => a - b)
        this.floor = Math.max(0.0005, Math.min(0.04, sorted[Math.floor(sorted.length * 0.35)] || 0.0005))
        this.calibrated = true; this.baseline = []
      }
      return null
    }
    if (!this.speaking && this.armed === 0 && energy < this.floor * 1.8) this.floor += (energy - this.floor) * (energy < this.floor ? 0.04 : 0.006)
    this.floor = Math.max(0.0005, Math.min(0.04, this.floor))
    this.threshold = Math.max(0.0045, this.floor * 2.4)
    if (!this.speaking) {
      this.armed = energy > this.threshold ? this.armed + ms : 0
      if (this.armed < 130) return null
      this.speaking = true; this.voiced = this.armed; this.elapsed = this.armed; return 'start'
    }
    this.elapsed += ms
    if (energy > this.threshold * 0.55) { this.voiced += ms; this.quiet = 0 } else this.quiet += ms
    if (this.quiet < pauseMs && this.elapsed < 30000) return null
    const valid = this.voiced >= 280 && this.elapsed >= 550
    this.reset(); return valid ? 'end' : 'discard'
  }
}
