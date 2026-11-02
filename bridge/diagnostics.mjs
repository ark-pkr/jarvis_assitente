import { homedir } from 'node:os'
import { speechStatus } from './speech.mjs'

const KEEP_LINES = 60
const LINE_CHARS = 300
const lines = []

/**
 * This text is made to be pasted somewhere, so everything in it passes through
 * here. The values of the secrets themselves go first, whatever they look like.
 */
export function redact(text, env = process.env) {
  let out = String(text)
  for (const [name, value] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name) && value && value.length >= 8) out = out.split(value).join('[segredo]')
  }
  return out
    .replace(/AIza[\w-]{20,}/g, '[segredo]')
    .replace(/\b(?:sk|pk|xi)[-_][\w-]{16,}/g, '[segredo]')
    .replace(/(bearer\s+)\S+/gi, '$1[segredo]')
    .replace(/([?&](?:key|token|access_token|refresh_token|code)=)[^&\s]+/gi, '$1[segredo]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .split(homedir()).join('~')
}

const said = (value) => value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value)

/** Warnings and errors only: normal logging is where a conversation could show up. */
export function watchLogs(target = console) {
  for (const level of ['warn', 'error']) {
    const original = target[level].bind(target)
    target[level] = (...args) => {
      original(...args)
      lines.push(`${new Date().toISOString().slice(11, 19)} ${level} ${args.map(said).join(' ').slice(0, LINE_CHARS)}`)
      if (lines.length > KEEP_LINES) lines.shift()
    }
  }
}

export function diagnosticReport({ provider, model }, client = {}) {
  const voice = speechStatus()
  return redact([
    `JARVIS ${process.env.JARVIS_VERSION || 'desenvolvimento'} · ${process.platform} ${process.arch} · Node ${process.version}`,
    `Serviço ligado há ${Math.round(process.uptime() / 60)} min · ${provider} ${model}`,
    `Chave Gemini: ${process.env.GEMINI_API_KEY ? 'sim' : 'não'} · Agenda: ${process.env.JARVIS_GOOGLE_REFRESH_TOKEN ? 'sim' : 'não'}`,
    `Voz nesta sessão: ${JSON.stringify(voice.generated)} geradas, ${voice.remembered} sem gastar cota · principal ${voice.mainSpent ? 'esgotada' : 'ok'} · reserva ${voice.spareSpent ? 'esgotada' : 'ok'}`,
    `Tela: ${String(client.phase ?? '?').slice(0, 40)} · ${String(client.screen ?? '?').slice(0, 40)}`,
    `Fala: ${JSON.stringify(client.speech ?? {}).slice(0, LINE_CHARS)}`,
    '',
    'Erros da tela:',
    ...(Array.isArray(client.errors) && client.errors.length ? client.errors.slice(-20).map((line) => String(line).slice(0, LINE_CHARS)) : ['nenhum']),
    '',
    'Avisos e erros do serviço:',
    ...(lines.length ? lines : ['nenhum']),
  ].join('\n'))
}

export async function handleDiagnostics(req, res, cors, service) {
  if (req.method !== 'POST') { res.writeHead(405, cors); return res.end() }
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 64000) { res.writeHead(413, cors); return res.end() }
  }
  let client = {}
  try { client = JSON.parse(body) } catch { /* Whatever the service knows is still worth having. */ }
  res.writeHead(200, { ...cors, 'content-type': 'text/plain; charset=utf-8' })
  res.end(diagnosticReport(service, client))
}
