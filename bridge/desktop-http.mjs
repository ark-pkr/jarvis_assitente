import { timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
export function desktopAuthorized(req, token = process.env.JARVIS_SESSION_TOKEN) {
  if (!token) return true
  const supplied = /(?:^|;\s*)jarvis_session=([^;]+)/.exec(req.headers.cookie || '')?.[1] || ''
  const actual = Buffer.from(supplied); const expected = Buffer.from(token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export async function serveDesktop(req, res, directory = process.env.JARVIS_STATIC_DIR) {
  if (!directory || !['GET', 'HEAD'].includes(req.method)) return false
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname))
    const relative = path.relative(path.resolve(directory), file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.pv': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' }[path.extname(file)]
    if (!type) return false
    const info = await fs.stat(file)
    if (!info.isFile() || info.size > 40 * 1024 * 1024) return false
    res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : await fs.readFile(file)); return true
  } catch { return false }
}
