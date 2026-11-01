import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createCanvas } from '@napi-rs/canvas'
const root = process.cwd()
const destination = path.join(root, 'desktop-app')
await fs.mkdir(destination, { recursive: true })
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
const dependencies = Object.fromEntries(['@anthropic-ai/claude-agent-sdk', '@google/genai', '@modelcontextprotocol/sdk', '@napi-rs/canvas', '@picovoice/eagle-web', 'pdfjs-dist', 'playwright-core', 'ws', 'zod'].map((name) => [name, pkg.dependencies[name]]))
await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify({ name: 'jarvis-desktop', productName: 'JARVIS', version: pkg.version, description: 'Assistente pessoal para Windows com voz em português e Gemini', author: 'JARVIS', license: 'MIT', type: 'module', main: 'desktop/main.cjs', dependencies }, null, 2))
const eagleModel = await fs.readFile(path.join(root, 'public', 'eagle_params.pv'))
const eagleBlobHash = createHash('sha1').update(`blob ${eagleModel.length}\0`).update(eagleModel).digest('hex')
if (eagleModel.length !== 4658658 || eagleBlobHash !== 'a9b518b56c447cd5b30f6bd730e54c12a0796c0d') throw new Error('O modelo Picovoice Eagle não corresponde à versão licenciada e fixada.')
await fs.mkdir(path.join(destination, 'licenses'), { recursive: true })
await fs.copyFile(path.join(root, 'licenses', 'PICOVOICE-APACHE-2.0.txt'), path.join(destination, 'licenses', 'PICOVOICE-APACHE-2.0.txt'))
for (const directory of ['desktop', 'bridge', 'dist']) {
  const target = path.resolve(destination, directory)
  if (path.dirname(target) !== destination || path.relative(root, target).startsWith('..')) throw new Error('Destino de compilação fora da pasta do aplicativo.')
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(directory, target, { recursive: true, filter: (source) => !source.endsWith('.test.mjs') })
}
const canvas = createCanvas(256, 256); const c = canvas.getContext('2d')
c.fillStyle = '#04131b'; c.fillRect(0, 0, 256, 256)
c.strokeStyle = '#2de6b0'; c.lineWidth = 9; c.shadowColor = '#2de6b0'; c.shadowBlur = 14
c.beginPath(); c.arc(128, 128, 99, 0, 2 * Math.PI); c.stroke()
c.beginPath(); c.moveTo(80, 94); c.lineTo(176, 94); c.lineTo(128, 174); c.closePath(); c.stroke()
const png = canvas.toBuffer('image/png')
await fs.writeFile(path.join(destination, 'desktop', 'icon.png'), png)
await fs.writeFile('desktop/icon.png', png)
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18)
await fs.writeFile('desktop/icon.ico', Buffer.concat([ico, png]))
console.log('Aplicativo preparado sem chaves, dados pessoais ou dependências de desenvolvimento.')
