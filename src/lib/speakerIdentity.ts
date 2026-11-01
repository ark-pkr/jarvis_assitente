import type { Eagle, EagleProfile, EagleProfiler } from '@picovoice/eagle-web'

const model = {
  publicPath: '/eagle_params.pv',
  customWritePath: 'jarvis-eagle-3',
  version: 1,
}

export async function createSpeakerProfiler(accessKey: string) {
  const { EagleProfiler } = await import('@picovoice/eagle-web')
  return EagleProfiler.create(accessKey, model)
}

export async function createSpeakerRecognizer(accessKey: string) {
  const { Eagle } = await import('@picovoice/eagle-web')
  return Eagle.create(accessKey, model)
}

export async function wavToPcm16(blob: Blob, targetRate: number): Promise<Int16Array> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error('O áudio gravado não está no formato WAV esperado.')
  }
  let channels = 0
  let sourceRate = 0
  let bits = 0
  let dataOffset = -1
  let dataLength = 0
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkSize = view.getUint32(offset + 4, true)
    if (view.getUint32(offset, false) === 0x666d7420 && chunkSize >= 16) {
      if (view.getUint16(offset + 8, true) !== 1) throw new Error('O áudio precisa ser PCM sem compressão.')
      channels = view.getUint16(offset + 10, true)
      sourceRate = view.getUint32(offset + 12, true)
      bits = view.getUint16(offset + 22, true)
    } else if (view.getUint32(offset, false) === 0x64617461) {
      dataOffset = offset + 8
      dataLength = chunkSize
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  if (channels !== 1 || bits !== 16 || sourceRate < 8000 || dataOffset < 0 || dataOffset + dataLength > bytes.length) {
    throw new Error('O áudio capturado não é mono PCM de 16 bits.')
  }
  if (sourceRate === targetRate) {
    const samples = new Int16Array(Math.floor(dataLength / 2))
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true)
    return samples
  }
  const sourceCount = Math.floor(dataLength / 2)
  const targetCount = Math.floor(sourceCount * targetRate / sourceRate)
  const output = new Int16Array(targetCount)
  for (let i = 0; i < targetCount; i++) {
    const position = i * sourceRate / targetRate
    const lower = Math.floor(position)
    const upper = Math.min(sourceCount - 1, lower + 1)
    const fraction = position - lower
    const first = view.getInt16(dataOffset + lower * 2, true)
    const second = view.getInt16(dataOffset + upper * 2, true)
    output[i] = Math.round(first + (second - first) * fraction)
  }
  return output
}

export async function enrollUtterance(profiler: EagleProfiler, pcm: Int16Array): Promise<number> {
  let percentage = 0
  for (let offset = 0; offset + profiler.frameLength <= pcm.length; offset += profiler.frameLength) {
    percentage = await profiler.enroll(pcm.subarray(offset, offset + profiler.frameLength))
  }
  return percentage
}

export async function scoreSpeaker(
  audio: Blob,
  recognizer: Eagle,
  profile: EagleProfile,
  threshold: number,
): Promise<{ accepted: boolean; score: number | null }> {
  const pcm = await wavToPcm16(audio, recognizer.sampleRate)
  const values: number[] = []
  for (let offset = 0; offset < pcm.length; offset += recognizer.minProcessSamples) {
    const frame = new Int16Array(recognizer.minProcessSamples)
    frame.set(pcm.subarray(offset, offset + frame.length))
    const scores = await recognizer.process(frame, profile)
    if (scores?.length) values.push(scores[0])
  }
  if (values.length < 2) return { accepted: false, score: null }
  const strongest = [...values].sort((a, b) => b - a).slice(0, Math.max(2, Math.ceil(values.length / 3)))
  const score = strongest.reduce((sum, value) => sum + value, 0) / strongest.length
  return { accepted: score >= threshold, score }
}

export function profileToBase64(profile: EagleProfile): string {
  let binary = ''
  for (let offset = 0; offset < profile.bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...profile.bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export function profileFromBase64(value: string): EagleProfile {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes }
}
