import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectFiles } from './projects.mjs'
import { unpacked } from './paths.mjs'

const script = unpacked(fileURLToPath(new URL('./word.ps1', import.meta.url)))
export function callWord(payload, signal) {
  if (process.platform !== 'win32') throw new Error('Integração do Word disponível apenas no Windows.')
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-File', script], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal })
    let output = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Word ocupado ou com uma janela de diálogo. Feche o diálogo e tente novamente.')) }, 25000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 100000) child.kill() })
    child.stderr.on('data', () => {})
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
    child.stdin.on('error', () => {})
    child.on('close', () => {
      clearTimeout(timeout)
      let response
      try { response = JSON.parse(output.replace(/^\uFEFF/, '').trim()) } catch { return reject(new Error('Não foi possível conectar ao Word. Verifique a instalação e os diálogos abertos.')) }
      if (!response.ok) return reject(new Error(`Word: ${response.error}`))
      resolve(response.result)
    })
    child.stdin.end(JSON.stringify(payload), 'utf8')
  })
}

export class WordOffice {
  constructor({ invoke = callWord, files = projectFiles } = {}) { this.invoke = invoke; this.files = files; this.queue = Promise.resolve() }
  mutate(operation) { const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next }
  list(signal) { return this.invoke({ action: 'list' }, signal) }
  async newDocument(confirm, signal) {
    if ((await confirm({ action: 'Criar documento em branco no Word', url: 'Microsoft Word instalado', details: 'Criar um documento novo, sem fechar ou alterar os documentos existentes. Não será salvo automaticamente.' }))?.approved !== true) throw new Error('Criação cancelada.')
    signal?.throwIfAborted()
    return this.mutate(() => this.invoke({ action: 'new' }, signal))
  }
  async read(documentId, confirm, signal) {
    const metadata = (await this.list(signal)).documents.find((doc) => doc.id === documentId)
    if (!metadata) throw new Error('Documento não encontrado. Consulte word_documents.')
    if ((await confirm({ action: 'Ler documento do Word', url: metadata.name, details: 'Ler até 16000 caracteres e enviar o conteúdo ao Gemini para atender ao seu pedido.' }))?.approved !== true) throw new Error('Leitura cancelada.')
    return this.invoke({ action: 'inspect', documentId }, signal)
  }
  async append(documentId, text, newParagraph, confirm, signal) {
    return this.mutate(async () => {
      const before = await this.invoke({ action: 'inspect', documentId }, signal)
      if (before.readOnly) throw new Error('Documento somente leitura.')
      if ((await confirm({ action: 'Escrever no Word', url: before.name,
        details: `Documento: ${before.name}\nInserir ao final${newParagraph ? ', em novo parágrafo' : ''}, preservando o conteúdo existente:\n\n${text}` }))?.approved !== true) throw new Error('Escrita cancelada.')
      signal?.throwIfAborted()
      const after = await this.invoke({ action: 'append', documentId, expectedHash: before.hash, text, newParagraph }, signal)
      return { id: after.id, name: after.name, inserted: after.inserted, characters: after.characters,
        note: 'Texto inserido no Word. Ainda não foi salvo. Pode desfazer pelo Word com Ctrl+Z.' }
    })
  }
  async save(documentId, rootId, file, confirm, signal) {
    return this.mutate(async () => {
      if (path.extname(file).toLowerCase() !== '.docx') throw new Error('Escolha um destino .docx.')
      const destination = await this.files.resolve(rootId, file, true)
      try { await fs.lstat(destination); throw new Error('Destino já existe. Escolha outro nome.') } catch (error) { if (error.code !== 'ENOENT') throw error }
      const before = await this.invoke({ action: 'inspect', documentId }, signal)
      if ((await confirm({ action: 'Salvar documento do Word', url: destination, details: `Salvar ${before.name} como DOCX nesta pasta autorizada. Não substituirá um arquivo existente.` }))?.approved !== true) throw new Error('Salvamento cancelado.')
      signal?.throwIfAborted()
      await this.files.resolve(rootId, file, true)
      return this.invoke({ action: 'saveAs', documentId, expectedHash: before.hash, destination }, signal)
    })
  }
}
const office = new WordOffice()
export { office as wordOffice }
export function wordServer(ask) {
  const confirm = (details) => ask('approval', details, 90000)
  const safe = (handler) => async (args, extra) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await handler(args, extra?.signal)) }] } }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] } }
  }
  const documentId = z.string().describe('ID do documento retornado por word_documents ou word_new.')
  return createSdkMcpServer({ name: 'jarvis_word', version: '1.0.0', tools: [
    tool('word_documents', 'Lista documentos abertos no Word instalado, com IDs e indicação do ativo. Não lê o conteúdo. Se houver vários documentos e o pedido for ambíguo, pergunte qual usar.', {}, safe((_args, signal) => office.list(signal))),
    tool('word_new', 'Cria um documento em branco real no Microsoft Word instalado, após confirmação. Não pede ao usuário para clicar manualmente em documento em branco.', {}, safe((_args, signal) => office.newDocument(confirm, signal))),
    tool('word_read', 'Lê texto do documento escolhido com confirmação antes de enviar seu conteúdo ao Gemini.', { documentId }, safe(({ documentId }, signal) => office.read(documentId, confirm, signal))),
    tool('word_append', 'Escreve texto diretamente no documento Word escolhido, ao final, com confirmação. Preserva conteúdo existente. Use para pedidos como escreva Bom dia no documento. Se não houver documento, crie com word_new. Não salva automaticamente.', { documentId, text: z.string().min(1).max(20000), newParagraph: z.boolean().default(true) }, safe(({ documentId, text, newParagraph }, signal) => office.append(documentId, text, newParagraph, confirm, signal))),
    tool('word_save_as', 'Salva o documento aberto como DOCX em uma pasta autorizada, após confirmação, sem substituir arquivo existente. O ID pode mudar após salvar.', { documentId, rootId: z.string(), file: z.string() }, safe(({ documentId, rootId, file }, signal) => office.save(documentId, rootId, file, confirm, signal))),
  ] })
}
