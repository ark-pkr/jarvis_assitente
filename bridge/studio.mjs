import { promises as fs } from 'node:fs'
import path from 'node:path'
import { projectFiles } from './projects.mjs'
export async function handleLessonPdf(req, res, cors, files = projectFiles) {
  try {
    const url = new URL(req.url, 'http://localhost')
    const rootId = url.searchParams.get('rootId'); const file = url.searchParams.get('file')
    if (!rootId || !file || path.extname(file).toLowerCase() !== '.pdf') throw new Error('Escolha um PDF em pasta autorizada.')
    const target = await files.resolve(rootId, file)
    const info = await fs.stat(target)
    if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('O PDF deve ter até 20 MB.')
    const body = await fs.readFile(target)
    if (!body.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('Arquivo PDF inválido.')
    const headers = { ...cors, 'content-type': 'application/pdf', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' }
    if (req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range)
      if (!range) { res.writeHead(416, { ...headers, 'content-range': `bytes */${body.length}` }); return res.end() }
      const start = Number(range[1]); const end = Math.min(body.length - 1, range[2] ? Number(range[2]) : body.length - 1)
      if (start > end || start >= body.length) { res.writeHead(416, { ...headers, 'content-range': `bytes */${body.length}` }); return res.end() }
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 }); return res.end(body.subarray(start, end + 1))
    }
    res.writeHead(200, { ...headers, 'content-length': body.length }); res.end(body)
  } catch {
    res.writeHead(400, { ...cors, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('Não foi possível mostrar o PDF. Confira a pasta autorizada, o arquivo e o limite de 20 MB.')
  }
}
