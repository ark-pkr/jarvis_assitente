/**
 * A single shared microphone stream plus an analyser, so the reactor can pulse
 * with the user's voice. Opening the mic more than once causes Chrome to drop
 * the earlier stream, so everything that needs audio goes through here.
 */

import { useWorkspace } from '../workspace'
import { bandsFrom, SILENT, type Bands } from './voiceBands'
let stream: MediaStream | null = null
let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let buf: Uint8Array | null = null

export async function getMic(): Promise<MediaStream> {
  if (stream?.getAudioTracks().some((track) => track.readyState === 'live')) return stream
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null; analyser = null; buf = null
    void ctx?.close(); ctx = null
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(useWorkspace.getState().settings.inputDeviceId ? { deviceId: { exact: useWorkspace.getState().settings.inputDeviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    },
  })
  return stream
}

export async function startAnalyser(): Promise<void> {
  if (analyser && stream?.getAudioTracks().some((track) => track.readyState === 'live')) {
    if (ctx?.state === 'suspended') await ctx.resume()
    return
  }
  const s = await getMic()
  ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(s)
  analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.75
  src.connect(analyser)
  buf = new Uint8Array(analyser.frequencyBinCount)
}

export async function stopMicrophone(): Promise<void> {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  analyser = null
  buf = null
  const context = ctx
  ctx = null
  if (context && context.state !== 'closed') await context.close()
}

/** 0..1 loudness. Returns 0 before the analyser is up. */
export function micLevel(): number {
  if (!analyser || !buf) return 0
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>)
  let sum = 0
  // Skip the lowest bins — they're mostly rumble and mains hum.
  for (let i = 4; i < buf.length; i++) sum += buf[i]
  const avg = sum / (buf.length - 4) / 255
  // Voice sits low in this range; stretch it so the visuals actually move.
  return Math.min(1, avg * 3.2)
}

/** The same reading split into the parts of a voice. */
export function micBands(): Bands {
  if (!analyser || !buf) return SILENT
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>)
  return bandsFrom(buf, analyser.context.sampleRate)
}

/** Analyser fed from an <audio> element, so the orb reacts while JARVIS talks. */
export function attachOutputAnalyser(el: HTMLAudioElement): () => number {
  const c = new AudioContext()
  const src = c.createMediaElementSource(el)
  const a = c.createAnalyser()
  a.fftSize = 512
  a.smoothingTimeConstant = 0.7
  src.connect(a)
  a.connect(c.destination)
  const b = new Uint8Array(a.frequencyBinCount)
  return () => {
    a.getByteFrequencyData(b as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (let i = 2; i < b.length; i++) sum += b[i]
    return Math.min(1, sum / (b.length - 2) / 255 * 3)
  }
}
