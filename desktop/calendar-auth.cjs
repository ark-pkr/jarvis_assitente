const http = require('node:http')
const { createHash, randomBytes } = require('node:crypto')

/**
 * Connecting a Google account, the way Google asks a desktop app to.
 *
 * The browser does the sign-in, so this app never sees the password. Google sends
 * the browser back to a port opened here for this one moment, and PKCE ties that
 * answer to this attempt, so a code stolen on the way is worth nothing.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const WAIT_MS = 180000
const page = (text) => `<!doctype html><meta charset="utf-8"><title>JARVIS</title><body style="font:16px system-ui;background:#01060c;color:#e1f9ff;display:grid;place-items:center;height:90vh"><p>${text}</p>`

/** Resolves with the refresh token. `open` shows the address in the person's browser. */
function connectCalendar({ clientId, clientSecret, open, fetcher = fetch, waitMs = WAIT_MS }) {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(24).toString('hex')
  return new Promise((resolve, reject) => {
    let timer
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/') { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      const finish = (error, token) => { clearTimeout(timer); server.close(); if (error) reject(error); else resolve(token) }
      if (url.searchParams.get('state') !== state) { res.end(page('Pedido recusado.')); return }
      const code = url.searchParams.get('code')
      if (!code) { res.end(page('Conexão cancelada. Pode fechar esta aba.')); finish(new Error('Conexão cancelada.')); return }
      try {
        const answer = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${server.address().port}` }) })
        const tokens = await answer.json()
        if (!answer.ok || !tokens.refresh_token) throw new Error('O Google não concluiu a conexão. Confira o ID e a chave do cliente.')
        res.end(page('Google Agenda conectada. Pode fechar esta aba e voltar ao JARVIS.'))
        finish(null, tokens.refresh_token)
      } catch (error) {
        res.end(page('Não foi possível conectar. Volte ao JARVIS.'))
        finish(error)
      }
    })
    server.on('error', reject)
    // Loopback only: nothing else on the network can reach this door.
    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(() => { server.close(); reject(new Error('Tempo esgotado para conectar a Google Agenda.')) }, waitMs)
      const address = new URLSearchParams({ client_id: clientId, redirect_uri: `http://127.0.0.1:${server.address().port}`, response_type: 'code', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' })
      Promise.resolve(open(`${AUTH_URL}?${address}`)).catch((error) => { clearTimeout(timer); server.close(); reject(error) })
    })
  })
}

/** Tells Google to forget the grant. Disconnecting works here even if this fails. */
const revokeCalendar = (token, fetcher = fetch) => fetcher(REVOKE_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }).catch(() => {})

module.exports = { connectCalendar, revokeCalendar, SCOPE }
