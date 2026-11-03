/**
 * Who is allowed to talk to this bridge.
 *
 * A WebSocket handshake is not subject to the same-origin policy: the browser
 * sends it on behalf of whatever page asked, no preflight stands in the way,
 * and the page reads every byte that comes back. Without a check here, any tab
 * the user happens to have open could open a socket to ws://localhost:8787,
 * drive the agent with every MCP server on this machine, and read back every
 * token and panel. The Origin header is the only thing that separates our own
 * dev server from someone else's page, so it is checked explicitly.
 *
 * A missing Origin means a non-browser client — curl, a script, a native app.
 * That is also exactly what local malware looks like, so it is refused on the
 * socket unless JARVIS_ALLOW_NO_ORIGIN=1 says otherwise.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Vite takes the next free port when 5173 is busy and `vite preview` starts at
 * 4173, so the dev ranges are allowed rather than two exact numbers. Anything
 * else — including localhost on a port some other app is serving — has to be
 * named in JARVIS_ALLOWED_ORIGINS.
 */
export const isDevPort = (port) =>
  (port >= 5173 && port <= 5199) || (port >= 4173 && port <= 4199)

const trimSlash = (value) => value.replace(/\/+$/, '')

export function createOriginPolicy(env = process.env) {
  const extra = new Set(
    (env.JARVIS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => trimSlash(s.trim()))
      .filter(Boolean),
  )
  const allowNoOrigin = env.JARVIS_ALLOW_NO_ORIGIN === '1'

  function originAllowed(origin) {
    if (!origin) return allowNoOrigin
    if (extra.has(trimSlash(origin))) return true
    let url
    try {
      url = new URL(origin)
    } catch {
      return false
    }
    if (url.protocol !== 'http:') return false
    if (!LOCAL_HOSTS.has(url.hostname)) return false
    return isDevPort(Number(url.port))
  }

  const describe = () =>
    '[jarvis] accepting local dev origins' +
    (extra.size ? ` plus ${[...extra].join(', ')}` : '') +
    (allowNoOrigin ? ' and clients that send no origin' : '')

  return { originAllowed, describe }
}

/**
 * CORS, reflected rather than wildcarded.
 *
 * `*` on this origin means any page on the internet can read whatever the
 * bridge serves, so the same allowlist that guards the socket picks the
 * header. The caller refuses an Origin we don't know before getting here —
 * but a request with no Origin at all is served, because an <img src> load
 * (which is how panels fetch screenshots) never sends one.
 */
export function corsFor(req) {
  const origin = req.headers.origin
  const headers = { vary: 'origin' }
  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers['access-control-allow-headers'] = 'content-type'
  }
  return headers
}
