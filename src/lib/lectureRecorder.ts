import { BRIDGE_HTTP_URL } from '../config'
import { getMic } from './audio'

/**
 * A class, a minute at a time.
 *
 * Each minute is a recording of its own, so each one is a complete file the bridge can
 * read alone, and a failure loses that minute and not the class. They record from the
 * microphone the voice loop already holds, because a second capture makes Chrome drop
 * the first. The few milliseconds between two recordings are not worth overlapping.
 */

const MINUTE_MS = 60000
const TRIES = 3
const RETRY_MS = 4000

export type LectureRecording = { stop: (deliver?: boolean) => Promise<void> }
export type LectureNotes = { title: string; html: string; notes: { spoken?: string; summary?: string } | null }

async function deliverPart(id: string, seq: number, part: Blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${BRIDGE_HTTP_URL}/lecture/part?id=${id}&seq=${seq}`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: part })
      if (response.ok) return
      throw new Error(`status ${response.status}`)
    } catch (error) {
      if (attempt >= TRIES) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS * attempt))
    }
  }
}

export async function recordLecture(id: string, onLost: (minutes: number) => void): Promise<LectureRecording> {
  let stopping = false
  let deliver = true
  let seq = 0
  let lost = 0
  let current: MediaRecorder | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const sending = new Set<Promise<void>>()

  const nextMinute = (source: MediaStream) => {
    const recorder = new MediaRecorder(source, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 })
    const pieces: Blob[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) pieces.push(event.data) }
    recorder.onstop = () => {
      const number = seq++
      if (deliver && pieces.length) {
        const job: Promise<void> = deliverPart(id, number, new Blob(pieces, { type: 'audio/webm' }))
          .catch(() => { onLost(++lost) })
          .finally(() => { sending.delete(job) })
        sending.add(job)
      }
      // A microphone unplugged mid-class comes back here, or is reported as lost time.
      if (!stopping) void getMic().then(nextMinute).catch(() => { onLost(++lost) })
    }
    recorder.start()
    current = recorder
    timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, MINUTE_MS)
  }
  nextMinute(await getMic())

  return {
    stop: async (keep = true) => {
      stopping = true
      deliver = keep
      clearTimeout(timer)
      if (current?.state === 'recording') {
        const last = current
        await new Promise<void>((resolve) => { last.addEventListener('stop', () => resolve(), { once: true }); last.stop() })
      }
      await Promise.all(sending)
    },
  }
}

export async function finishLecture(id: string): Promise<LectureNotes> {
  const response = await fetch(`${BRIDGE_HTTP_URL}/lecture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'finish', id }) })
  const result = await response.json() as LectureNotes & { error?: string }
  if (!response.ok) throw new Error(result.error || 'As anotações falharam.')
  return result
}
