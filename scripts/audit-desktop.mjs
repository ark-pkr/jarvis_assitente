import '../bridge/env.mjs'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve('release/win-unpacked/resources/app')
const key = process.env.GEMINI_API_KEY ? Buffer.from(process.env.GEMINI_API_KEY) : null
let count = 0
async function walk(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    assert.ok(!/^\.env(?:\.|$)|^\.jarvis-data$|^\.browser-profile$/.test(item.name), 'Dado privado dentro do pacote: ' + item.name)
    const filename = path.join(directory, item.name)
    if (item.isDirectory()) await walk(filename)
    else if (item.isFile()) {
      count++
      if (!key) continue
      let tail = Buffer.alloc(0)
      for await (const chunk of createReadStream(filename)) {
        const bytes = Buffer.concat([tail, chunk])
        assert.equal(bytes.includes(key), false, 'Credencial encontrada no pacote: ' + filename)
        tail = bytes.subarray(Math.max(0, bytes.length - key.length + 1))
      }
    }
  }
}
await walk(root)
await assert.rejects(fs.stat(path.join(root, 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe')), { code: 'ENOENT' })
console.log(`Pacote auditado: ${count} arquivos, sem chave Gemini ou pastas de dados pessoais, sem o CLI Claude desnecessário.`)
