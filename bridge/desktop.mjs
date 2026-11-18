import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { dataPath, unpacked } from './paths.mjs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { projectFiles } from './projects.mjs'

const storage = dataPath('applications.json')
export function launchViaWindows(executable, args) {
  return new Promise((resolve, reject) => {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-File', unpacked(fileURLToPath(new URL('./desktop-launch.ps1', import.meta.url)))], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('O Windows não respondeu à abertura do aplicativo.')) }, 15000)
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', () => {}); child.stdin.on('error', () => {})
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => { clearTimeout(timer); if (code !== 0) return reject(new Error('Não foi possível solicitar a abertura no Windows.')); try { resolve(JSON.parse(output.replace(/^\uFEFF/, ''))) } catch { reject(new Error('Resposta inválida do Windows.')) } })
    child.stdin.end(JSON.stringify({ executable, args }), 'utf8')
  })
}
const forbidden = /^(?:cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|regedit|node|python\d*|pythonw|java|javaw|dotnet|csc|msbuild|bash|wsl|schtasks|sc|reg|msiexec|install.*|unins.*|setup.*)\.exe$/i
export async function validateExecutable(file) {
  if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.exe' || forbidden.test(path.basename(file))) throw new Error('Escolha um aplicativo .exe, não um terminal, instalador ou interpretador.')
  if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Executável não pode ser um link simbólico.')
  const resolved = await fs.realpath(file)
  if (!(await fs.stat(resolved)).isFile() || forbidden.test(path.basename(resolved))) throw new Error('Aplicativo inválido.')
  return resolved
}
/**
 * Never opened by voice, whatever the Start menu lists: anything that runs
 * commands, changes the system, or removes software. Matched against the name
 * and the Windows id, without accents.
 */
export const FORBIDDEN_START_APP = /prompt|powershell|pwsh|\bterminal\b|cmd\.exe|\bbash\b|\bwsl\b|ubuntu|debian|kali|regedit|registro|uninstall|desinstal|\bsetup\b|instalador|installer|servicos|services\.msc|agendador|task scheduler|gerenciamento do computador|computer management|diretiva|group policy|ferramentas do windows|windows tools|node\.js|\bpython\b|\bidle\b|git (?:bash|cmd)|developer|recovery|recuperacao|diskpart|limpeza de disco|editor de politica/i
const plain = (text) => String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/** Everything the Start menu lists, as Windows names it: { name, appId }. */
export function readStartApps() {
  return new Promise((resolve, reject) => {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const command = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('O Windows não listou os aplicativos a tempo.')) }, 15000)
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { output += chunk })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('Não foi possível listar os aplicativos do Windows.'))
      try {
        const parsed = JSON.parse(output.replace(/^\uFEFF/, '') || '[]')
        resolve((Array.isArray(parsed) ? parsed : [parsed]).map((app) => ({ name: String(app.Name ?? ''), appId: String(app.AppID ?? '') })))
      } catch { reject(new Error('Lista de aplicativos inválida.')) }
    })
  })
}
/** The Start menu changes when something is installed, not from one minute to the next. */
const START_APPS_MS = 10 * 60 * 1000

export class DesktopApps {
  constructor(options = {}) {
    this.storage = options.storage || storage
    this.readStartApps = options.readStartApps || (process.platform === 'win32' ? readStartApps : async () => [])
    this.startCache = null
    this.files = options.files || projectFiles
    this.launch = options.launch || (process.env.JARVIS_DESKTOP === '1' ? launchViaWindows : (executable, args) => new Promise((resolve, reject) => {
      const child = spawn(executable, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false })
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve({ pid: child.pid }) })
    }))
  }
  async custom() {
    try { return JSON.parse(await fs.readFile(this.storage, 'utf8')) }
    catch (e) { if (e.code === 'ENOENT') return []; throw e }
  }
  async list() {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)
    const local = process.env.LOCALAPPDATA || ''
    const system = process.env.SystemRoot || 'C:\\Windows'
    const office = (exe) => roots.flatMap((root) => [path.join(root, 'Microsoft Office', 'root', 'Office16', exe), path.join(root, 'Microsoft Office', 'Office16', exe)])
    const candidates = [
      ['vscode', 'Visual Studio Code', [path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'), ...roots.map((r) => path.join(r, 'Microsoft VS Code', 'Code.exe'))]],
      ['word', 'Microsoft Word', office('WINWORD.EXE')], ['excel', 'Microsoft Excel', office('EXCEL.EXE')],
      ['powerpoint', 'Microsoft PowerPoint', office('POWERPNT.EXE')], ['outlook', 'Microsoft Outlook', office('OUTLOOK.EXE')],
      ['notepad', 'Bloco de Notas', [path.join(system, 'System32', 'notepad.exe')]],
      ['explorer', 'Explorador de Arquivos', [path.join(system, 'explorer.exe')]],
      ['calculator', 'Calculadora', [path.join(system, 'System32', 'calc.exe')]],
      ['paint', 'Paint', [path.join(system, 'System32', 'mspaint.exe')]],
    ]
    const result = []
    for (const [id, name, files] of candidates) for (const file of files) {
      try { result.push({ id, name, executable: await validateExecutable(file) }); break } catch { /* not installed here */ }
    }
    for (const app of await this.custom()) {
      try { await validateExecutable(app.executable); if (!result.some((a) => a.executable === app.executable)) result.push(app) } catch { /* removed app */ }
    }
    // Everything else installed, by the name the Start menu shows: no path to find or type.
    for (const app of await this.startApps()) {
      const name = plain(app.name)
      if (result.some((known) => plain(known.name) === name || plain(known.name).endsWith(` ${name}`))) continue
      result.push({ id: `start:${app.appId}`, name: app.name, start: true })
    }
    return result
  }
  async startApps() {
    if (this.startCache && Date.now() - this.startCache.at < START_APPS_MS) return this.startCache.apps
    let listed = []
    try { listed = await this.readStartApps() } catch { /* the fixed list still works */ }
    const apps = listed.filter((app) => app.name && app.appId && !/["\r\n]/.test(app.appId) && !FORBIDDEN_START_APP.test(plain(`${app.name} ${app.appId}`)))
    this.startCache = { at: Date.now(), apps }
    return apps
  }
  /** Installed apps, optionally only those whose name contains the words asked for. */
  async find(query = '') {
    const wanted = plain(query).trim()
    const all = await this.list()
    return wanted ? all.filter((app) => plain(app.name).includes(wanted)) : all
  }
  async register(name, file, confirm) {
    const executable = await validateExecutable(file)
    const known = (await this.list()).find((a) => a.executable === executable)
    if (known) return known
    if ((await confirm({ action: 'Cadastrar aplicativo', url: executable, details: `Cadastrar ${name} para abertura com confirmação. Não instala software nem concede acesso de administrador.` }))?.approved !== true) throw new Error('Cancelado.')
    const apps = await this.custom(); const app = { id: randomUUID(), name, executable }; apps.push(app)
    await fs.mkdir(path.dirname(this.storage), { recursive: true }); await fs.writeFile(this.storage, JSON.stringify(apps, null, 2))
    return app
  }
  async open({ appId, rootId, file, line }) {
    const app = (await this.list()).find((a) => a.id === appId)
    if (!app) throw new Error('Aplicativo não encontrado. Consulte desktop_apps.')
    if (app.start) {
      if (rootId || file) throw new Error('Este aplicativo abre sozinho; para abrir um arquivo, use VS Code, Word, Excel, PowerPoint ou Bloco de Notas.')
      // Explorer opens anything the Start menu lists by its id, Store apps included.
      const explorer = await validateExecutable(path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'))
      return { requested: true, app: app.name, ...await this.launch(explorer, [`shell:AppsFolder\\${app.id.slice('start:'.length)}`]), note: 'Abertura solicitada ao Windows. Isso não comprova que a janela carregou.' }
    }
    const executable = await validateExecutable(app.executable)
    const before = await fs.stat(executable)
    let target
    const args = []
    if (file && !rootId) throw new Error('Autorize uma pasta antes de abrir arquivos.')
    if (rootId) {
      target = await this.files.resolve(rootId, file || '.')
      const directory = (await fs.stat(target)).isDirectory()
      const formats = { word: ['.docx', '.doc', '.rtf'], excel: ['.xlsx', '.xls', '.csv'], powerpoint: ['.pptx', '.ppt'], notepad: ['.txt', '.md', '.js', '.ts', '.py', '.json', '.html', '.css', '.sql'] }
      if (directory && !['vscode', 'explorer'].includes(app.id)) throw new Error('Escolha um documento compatível para este aplicativo.')
      if (!directory && app.id !== 'vscode' && !(formats[app.id] || []).includes(path.extname(target).toLowerCase())) throw new Error('Formato não habilitado para este aplicativo.')
      if (app.id === 'vscode') { args.push('--reuse-window'); if (directory) args.push(target); else args.push('--goto', `${target}:${line || 1}:1`) }
      else args.push(target)
    } else if (app.id === 'vscode') args.push('--reuse-window')
    const latest = await fs.stat(await validateExecutable(executable))
    if (before.size !== latest.size || before.mtimeMs !== latest.mtimeMs) throw new Error('Executável alterado. Solicite novamente.')
    if (target) await this.files.resolve(rootId, file || '.')
    return { requested: true, app: app.name, target: target || null, ...await this.launch(executable, args), note: 'Abertura solicitada ao Windows. Isso não comprova que a janela carregou nem permite controlar menus ou editar documentos abertos.' }
  }
}
const apps = new DesktopApps()
export { apps as desktopApps }
export function desktopServer(ask) {
  const confirm = (details) => ask('approval', details, 90000)
  const safe = (handler) => async (args) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await handler(args)) }] } }
    catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] } }
  }
  return createSdkMcpServer({ name: 'jarvis_desktop', version: '1.0.0', tools: [
    tool('desktop_apps', 'Lista os aplicativos instalados no computador, os mesmos do Menu Iniciar (inclusive os da Microsoft Store), além de VS Code e Office. Passe busca com parte do nome (ex.: "spotify", "chrome") para achar um. Nunca peça ao usuário o caminho do programa: procure aqui. Para abrir, use desktop_open com o id e não uma URL.', { busca: z.string().max(80).optional() }, safe(({ busca }) => apps.find(busca))),
    tool('desktop_register', 'Último recurso: cadastra um .exe que não aparece em desktop_apps, só se o usuário der o caminho por conta própria. Exige confirmação. Não aceita comandos, scripts, terminais ou argumentos.', { name: z.string().min(1).max(80), executable: z.string() }, safe(({ name, executable }) => apps.register(name, executable, confirm))),
    tool('desktop_open', 'Abre na hora, sem pedir confirmação, um aplicativo de desktop_apps. VS Code, Word, Excel, PowerPoint e Bloco de Notas também abrem um arquivo ou pasta (VS Code em uma linha específica). Terminais, PowerShell e ferramentas de sistema não abrem. Para criar ou escrever no Word use word_new e word_append. Não controla menus. Edite código com project_write.', { appId: z.string(), rootId: z.string().optional(), file: z.string().optional(), line: z.number().int().min(1).max(1000000).optional() }, safe((args) => apps.open(args))),
  ] })
}
