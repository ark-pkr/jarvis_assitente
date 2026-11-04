/**
 * Checks the packaged app before it is published: no API key, no personal data
 * folder, no .env file and no Claude CLI anywhere in it, packed or unpacked.
 *
 *   node scripts/audit-desktop.mjs     (after npm run desktop:dist)
 */
import '../bridge/env.mjs'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const asar = createRequire(import.meta.url)('@electron/asar')
const resources = path.resolve('release/win-unpacked/resources')
const archive = path.join(resources, 'app.asar')
const key = process.env.GEMINI_API_KEY ? Buffer.from(process.env.GEMINI_API_KEY) : null
const PRIVATE = /^\.env(?:\.|$)|^\.jarvis-data$|^\.browser-profile$|^desktop-settings\.json$/

/** Streams a file looking for the key, across chunk boundaries. */
async function holdsKey(filename) {
  if (!key) return false
  let tail = Buffer.alloc(0)
  for await (const chunk of createReadStream(filename)) {
    const bytes = Buffer.concat([tail, chunk])
    if (bytes.includes(key)) return true
    tail = bytes.subarray(Math.max(0, bytes.length - key.length + 1))
  }
  return false
}

await fs.access(archive).catch(() => { throw new Error('Não encontrei release/win-unpacked/resources/app.asar. Rode antes: npm run desktop:dist') })

// Inside the archive: names only, since the bytes are checked as one file below.
const packed = asar.listPackage(archive).map((entry) => entry.replace(/^[\\/]/, ''))
for (const entry of packed) {
  for (const part of entry.split(/[\\/]/)) assert.ok(!PRIVATE.test(part), `Dado privado dentro do pacote: ${entry}`)
}
assert.ok(!packed.some((entry) => /claude-agent-sdk-win32-x64[\\/]claude\.exe$/.test(entry)), 'O CLI Claude, desnecessário, está no pacote.')
assert.ok(packed.some((entry) => /^bridge[\\/]server\.mjs$/.test(entry)), 'O serviço local não está no pacote.')

// The archive itself and everything kept outside it.
let count = 0
async function walk(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    assert.ok(!PRIVATE.test(item.name), `Dado privado no pacote: ${path.join(directory, item.name)}`)
    const filename = path.join(directory, item.name)
    if (item.isDirectory()) await walk(filename)
    else if (item.isFile()) {
      count++
      assert.equal(await holdsKey(filename), false, `Credencial encontrada no pacote: ${filename}`)
    }
  }
}
await walk(resources)

for (const script of ['word.ps1', 'media.ps1', 'desktop-launch.ps1']) {
  await fs.access(path.join(resources, 'app.asar.unpacked', 'bridge', script)).catch(() => { throw new Error(`${script} precisa ficar fora do app.asar, ou o PowerShell não o encontra.`) })
}

console.log(`Pacote auditado: ${packed.length} arquivos no app.asar e ${count} fora dele, sem chave Gemini, sem pastas de dados pessoais e sem o CLI Claude.`)
