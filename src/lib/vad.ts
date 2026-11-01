import { getMic } from './audio'
import { SpeechGate } from './speechGate'
import { useWorkspace } from '../workspace'

export type VadHandlers = { onStart: () => void; onEnd: (audio: Blob, ms: number) => void; onLevel: (value: number) => void; onError: (message: string) => void; onAudio?: (samples: Float32Array, rate: number) => void; onSegment?: (samples: Float32Array, rate: number) => void; onDiscard?: () => void }
export type Vad = { stop: () => void; setGuard: (on: boolean) => void; live: () => boolean; meter: () => { energy: number; floor: number; threshold: number; speaking: boolean } }

// Batch PCM in the audio thread. Unlike RAF/MediaRecorder, this preserves the
// onset of quiet syllables and keeps separate utterances from sharing chunks.
const processor = `class JarvisCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0 }
  process(inputs) {
    const samples = inputs[0]?.[0]; if (!samples) return true;
    for (const sample of samples) {
      this.buffer[this.offset++] = sample;
      if (this.offset === 2048) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(2048); this.offset = 0; }
    }
    return true;
  }
} registerProcessor('jarvis-capture', JarvisCapture);`

export function pcmWave(chunks: Float32Array[], sourceRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Float32Array(length); let offset = 0
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length }
  const rate = 16000; const step = sourceRate / rate; const count = Math.floor(length / step)
  const buffer = new ArrayBuffer(44 + count * 2); const view = new DataView(buffer)
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, count * 2, true)
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step); const end = Math.min(length, Math.floor((i + 1) * step))
    let total = 0; for (let j = start; j < end; j++) total += samples[j]
    const value = Math.max(-1, Math.min(1, total / Math.max(1, end - start)))
    view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function startVad(h: VadHandlers): Promise<Vad> {
  const ctx = new AudioContext()
  let stopped = false; let guarded = false; let releaseAt = 0
  const gate = new SpeechGate()
  let energy = 0; let duration = 0
  let ring: Float32Array[] = []; let recorded: Float32Array[] = []
  let source: MediaStreamAudioSourceNode | undefined; let capture: AudioWorkletNode | undefined
  let calibrated: () => void = () => {}
  const ready = new Promise<void>((resolve) => { calibrated = resolve })
  const reset = () => { gate.reset(); duration = 0; recorded = []; ring = [] }
  const stop = () => { if (stopped) return; stopped = true; reset(); capture?.disconnect(); source?.disconnect(); void ctx.close() }
  try {
    const stream = await getMic()
    await ctx.resume()
    const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' }))
    try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
    source = ctx.createMediaStreamSource(stream)
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 85
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 7000
    source.connect(high); high.connect(low)
    capture = new AudioWorkletNode(ctx, 'jarvis-capture'); low.connect(capture)
    const mute = ctx.createGain(); mute.gain.value = 0; capture.connect(mute); mute.connect(ctx.destination)
    capture.port.onmessage = ({ data: samples }: MessageEvent<Float32Array>) => {
      if (stopped) return
      // Before the guard below, which is the point: this hears him being called
      // while the capture path is deliberately deaf to his own voice.
      h.onAudio?.(samples, ctx.sampleRate)
      let sum = 0; for (const sample of samples) sum += sample * sample
      energy = Math.sqrt(sum / samples.length)
      h.onLevel(Math.min(1, energy * 12))
      if (guarded || performance.now() < releaseAt) { reset(); return }
      const ms = samples.length / ctx.sampleRate * 1000
      const wasSpeaking = gate.speaking
      const pauseMs = Math.max(650, Math.min(2500, useWorkspace.getState().settings.speechPause * 1000 || 800))
      const event = gate.feed(energy, ms, pauseMs)
      if (gate.calibrated) calibrated()
      if (!wasSpeaking) {
        ring.push(samples)
        while (ring.length > Math.ceil(ctx.sampleRate * 0.65 / 2048)) ring.shift()
        if (event === 'start') { recorded = ring.slice(); ring = []; duration = recorded.reduce((sum, chunk) => sum + chunk.length / ctx.sampleRate * 1000, 0); h.onStart(); for (const chunk of recorded) h.onSegment?.(chunk, ctx.sampleRate) }
        return
      }
      recorded.push(samples); duration += ms
      h.onSegment?.(samples, ctx.sampleRate)
      if (event === 'end' || event === 'discard') {
        const chunks = recorded; const elapsed = duration
        reset()
        if (event === 'end') h.onEnd(pcmWave(chunks, ctx.sampleRate), elapsed)
        else h.onDiscard?.()
      }
    }
    await Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, 1200))])
  } catch {
    stop(); h.onError('Não foi possível capturar o áudio. Confira o microfone escolhido e a permissão no Windows.')
  }
  return { stop, setGuard: (on) => { if (guarded && !on) releaseAt = performance.now() + 700; guarded = on; if (on) reset() }, live: () => !stopped, meter: () => ({ energy, floor: gate.floor, threshold: gate.threshold, speaking: gate.speaking }) }
}
