import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataDirectory, replaceFile } from './paths.mjs'

/**
 * Only what would be lost for good. Keys, the signed-in browser profile and the
 * voice cache stay out, and a backup file names nothing outside this list: it is
 * data from a file someone picked, so it never chooses where it gets written.
 */
const FILES = ['assistant.json', 'applications.json', 'learned.json', 'library.json', 'quiz.json', 'rapport.json', 'tasks.json']
const LECTURE = /^lectures\/[\w-]{1,80}\.json$/
const allowed = (name) => FILES.includes(name) || LECTURE.test(name)

const FORMAT = 1
const AUTOMATIC_EVERY_MS = 7 * 86400000
const KEEP_AUTOMATIC = 5
const MAX_BODY = 64 * 1024 * 1024

const stamp = (time) => new Date(time).toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
const parses = (text) => { try { JSON.parse(text); return true } catch { return false } }

export class Backups {
  constructor({ directory = dataDirectory, folder = process.env.JARVIS_BACKUP_DIR || path.join(directory, 'backups') } = {}) {
    this.directory = directory
    this.folder = folder
  }
  async collect(workspace, now = Date.now()) {
    const files = {}
    const lectures = await fs.readdir(path.join(this.directory, 'lectures')).catch(() => [])
    const names = [...FILES, ...lectures.filter((name) => name.endsWith('.json')).map((name) => `lectures/${name}`)]
    for (const name of names) {
      try { files[name] = await fs.readFile(path.join(this.directory, name), 'utf8') }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return { app: 'jarvis', format: FORMAT, created: now, files, workspace: workspace ?? null }
  }
  async save(workspace, { label = 'backup', now = Date.now() } = {}) {
    await fs.mkdir(this.folder, { recursive: true })
    const file = path.join(this.folder, `jarvis-${label}-${stamp(now)}.json`)
    const temp = path.join(this.folder, `${randomUUID()}.tmp`)
    await fs.writeFile(temp, JSON.stringify(await this.collect(workspace, now)), { flag: 'wx' })
    await replaceFile(temp, file)
    return file
  }
  async list(prefix = 'jarvis-') {
    const names = await fs.readdir(this.folder).catch(() => [])
    return names.filter((name) => name.startsWith(prefix) && name.endsWith('.json')).sort()
  }
  async last() {
    const names = await this.list()
    const times = await Promise.all(names.map(async (name) => (await fs.stat(path.join(this.folder, name))).mtimeMs))
    return times.length ? Math.max(...times) : 0
  }
  /** Copies made by hand or before a restore are never pruned: those were on purpose. */
  async automatic(workspace, now = Date.now()) {
    if (now - await this.last() < AUTOMATIC_EVERY_MS) return null
    const file = await this.save(workspace, { label: 'automatico', now })
    const old = (await this.list('jarvis-automatico-')).slice(0, -KEEP_AUTOMATIC)
    await Promise.all(old.map((name) => fs.rm(path.join(this.folder, name), { force: true })))
    return file
  }
  check(snapshot) {
    if (snapshot?.app !== 'jarvis' || snapshot.format !== FORMAT || typeof snapshot.files !== 'object' || !snapshot.files) throw new Error('Este arquivo não é um backup do JARVIS.')
    for (const [name, text] of Object.entries(snapshot.files)) {
      if (!allowed(name) || typeof text !== 'string' || !parses(text)) throw new Error('O backup está danificado.')
    }
    if (snapshot.workspace !== null && (typeof snapshot.workspace !== 'string' || !parses(snapshot.workspace))) throw new Error('O backup está danificado.')
  }
  /** The backup replaces what is here, so what is here is saved first. */
  async restore(snapshot, current, now = Date.now()) {
    this.check(snapshot)
    const safety = await this.save(current, { label: 'antes-de-restaurar', now })
    const here = await this.collect(null, now)
    await fs.mkdir(path.join(this.directory, 'lectures'), { recursive: true })
    for (const [name, text] of Object.entries(snapshot.files)) {
      const temp = path.join(this.directory, `${randomUUID()}.tmp`)
      await fs.writeFile(temp, text, { flag: 'wx' })
      await replaceFile(temp, path.join(this.directory, name))
    }
    await Promise.all(Object.keys(here.files).filter((name) => !Object.hasOwn(snapshot.files, name)).map((name) => fs.rm(path.join(this.directory, name), { force: true })))
    return { safety, workspace: snapshot.workspace, created: snapshot.created }
  }
}

export const backups = new Backups()

export async function handleBackup(req, res, cors, store = backups) {
  const answer = (status, body) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.method === 'GET') return answer(200, { folder: store.folder, last: await store.last() })
  if (req.method !== 'POST') return answer(405, { error: 'Método inválido.' })
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) return answer(413, { error: 'Backup grande demais.' })
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (body.action === 'save') return answer(200, { file: await store.save(body.workspace) })
    if (body.action === 'automatic') return answer(200, { file: await store.automatic(body.workspace) })
    if (body.action === 'restore') return answer(200, await store.restore(body.snapshot, body.workspace))
    return answer(400, { error: 'Pedido inválido.' })
  } catch (error) {
    console.warn('[jarvis] backup:', error.message)
    return answer(400, { error: error.message })
  }
}
