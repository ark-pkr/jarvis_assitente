/**
 * Publishes the installer that `npm run desktop:dist` built to GitHub
 * Releases, where electron-updater looks for new versions.
 *
 * electron-builder can publish on its own, but it uploads the installer and
 * the blockmap in parallel and each upload tries to create the release, so
 * one of them fails with 422 and latest.yml never goes up. Without latest.yml
 * no installed JARVIS ever sees the version. So this does it in order:
 *
 *   1. writes release/latest.yml from the installer itself;
 *   2. creates the release as a draft (or reuses a draft left by a failed run);
 *   3. uploads the installer, the blockmap and, last, latest.yml;
 *   4. checks the sizes and only then publishes.
 *
 * A failure anywhere leaves at most a draft, which no installed copy can see.
 *
 *   $env:GH_TOKEN = "..."; npm run desktop:release
 */
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const OWNER = 'ark-pkr'
export const REPO = 'jarvis_assitente'

export const installerName = (version) => `JARVIS-Setup-${version}-x64.exe`

/** The file electron-updater downloads to decide whether there is anything new. */
export function latestYml({ version, file, sha512, size, date }) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${file}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${file}`,
    `sha512: ${sha512}`,
    `releaseDate: '${date.toISOString()}'`,
    '',
  ].join('\n')
}

/** This version's entry in CHANGELOG.md, used as the release notes. */
export function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${version}`)
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^## /.test(line))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
}

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

async function github(token, method, url, body, headers = {}) {
  const response = await fetch(url.startsWith('https://') ? url : `https://api.github.com/repos/${OWNER}/${REPO}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...headers },
    body,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  return { status: response.status, data }
}

async function main() {
  const token = process.env.GH_TOKEN?.trim()
  if (!token) fail('Defina o token antes: $env:GH_TOKEN = "seu-token" (precisa poder criar releases no repositório).')

  const root = process.cwd()
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const tag = `v${version}`
  const file = installerName(version)
  const installer = path.join(root, 'release', file)
  const blockmap = `${installer}.blockmap`
  for (const required of [installer, blockmap]) {
    try { await fs.access(required) } catch { fail(`Não encontrei ${path.relative(root, required)}. Rode antes: npm run desktop:dist`) }
  }

  // What ships has to be exactly what is on main: nothing uncommitted, nothing
  // from a branch that was never merged. The tag is created on GitHub, so the
  // commit it points to has to be there too.
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (dirty) fail('Há mudanças sem commit. Faça o commit (ou descarte) antes de publicar, para o instalador ser exatamente o que está no Git.')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'])
  const remote = execFileSync('git', ['branch', '-r', '--contains', commit], { encoding: 'utf8' })
  if (!remote.split('\n').some((line) => line.trim() === 'origin/main')) fail(`O commit ${commit.slice(0, 7)} não está na main do GitHub. Mescle o PR e publique a partir da main.`)

  const bytes = await fs.readFile(installer)
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const yml = latestYml({ version, file, sha512, size: bytes.length, date: new Date() })
  await fs.writeFile(path.join(root, 'release', 'latest.yml'), yml)
  console.log(`• latest.yml gerado para ${version} (${(bytes.length / 1e6).toFixed(1)} MB)`)

  const published = await github(token, 'GET', `/releases/tags/${tag}`)
  if (published.status === 200) fail(`A versão ${tag} já está publicada. Suba o número da versão em package.json antes de publicar de novo.`)

  // Drafts don't show up by tag, so a draft left by a failed run is found in the list.
  const list = await github(token, 'GET', '/releases?per_page=30')
  if (list.status === 401 || list.status === 403) fail('O GitHub recusou o token. Ele precisa da permissão public_repo (clássico) ou Contents: Read and write (fine-grained).')
  let release = list.data?.find?.((item) => item.draft && item.tag_name === tag)
  if (release) console.log(`• Reaproveitando o rascunho de ${tag}`)
  else {
    const notes = changelogSection(await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8'), version)
    const created = await github(token, 'POST', '/releases', JSON.stringify({ tag_name: tag, target_commitish: commit, name: version, body: notes, draft: true }), { 'content-type': 'application/json' })
    if (created.status !== 201) fail(`Não consegui criar o rascunho (${created.status}): ${created.data?.message ?? ''}`)
    release = created.data
    console.log(`• Rascunho de ${tag} criado`)
  }

  const uploads = [
    { name: file, data: bytes },
    { name: path.basename(blockmap), data: await fs.readFile(blockmap) },
    // Last: once this is up, the release is complete.
    { name: 'latest.yml', data: Buffer.from(yml) },
  ]
  for (const upload of uploads) {
    const old = release.assets?.find((asset) => asset.name === upload.name)
    if (old) await github(token, 'DELETE', `/releases/assets/${old.id}`)
    console.log(`• Enviando ${upload.name}…`)
    const sent = await github(token, 'POST', `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(upload.name)}`, upload.data, { 'content-type': 'application/octet-stream' })
    if (sent.status !== 201) fail(`O envio de ${upload.name} falhou (${sent.status}). O release continua como rascunho; rode de novo.`)
    if (sent.data.size !== upload.data.length) fail(`${upload.name} chegou com tamanho diferente. O release continua como rascunho; rode de novo.`)
  }

  const done = await github(token, 'PATCH', `/releases/${release.id}`, JSON.stringify({ draft: false, make_latest: 'true' }), { 'content-type': 'application/json' })
  if (done.status !== 200) fail(`Os arquivos subiram, mas não consegui publicar (${done.status}). Publique o rascunho em ${release.html_url}`)
  console.log(`\n✔ ${tag} publicada: ${done.data.html_url}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
