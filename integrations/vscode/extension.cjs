const vscode = require('vscode')
const fs = require('node:fs/promises')
const path = require('node:path')
exports.activate = (context) => {
  context.subscriptions.push(vscode.commands.registerCommand('jarvis.shareSelection', async () => {
    try {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.selection.isEmpty) throw new Error('Selecione o código que deseja explicar.')
      if (editor.document.uri.scheme !== 'file') throw new Error('Abra um arquivo local para compartilhar.')
      const text = editor.document.getText(editor.selection)
      if (text.length > 16000) throw new Error('Selecione até 16000 caracteres por vez.')
      const directory = vscode.workspace.getConfiguration('jarvis').get('snapshotDirectory')
      if (!directory || !path.isAbsolute(directory) || path.basename(directory) !== '.jarvis-data') throw new Error('Configure jarvis.snapshotDirectory com a pasta .jarvis-data do JARVIS.')
      const allowed = await vscode.window.showInformationMessage('Compartilhar este trecho com o JARVIS? Ao pedir a explicação, ele será enviado à IA configurada.', { modal: true }, 'Compartilhar')
      if (allowed !== 'Compartilhar') return
      await fs.mkdir(directory, { recursive: true })
      const target = path.join(directory, 'editor.json'); const temp = path.join(directory, 'editor.tmp')
      await fs.writeFile(temp, JSON.stringify({ path: editor.document.uri.fsPath, text, language: editor.document.languageId, startLine: editor.selection.start.line + 1, endLine: editor.selection.end.line + 1, time: Date.now(), unsaved: editor.document.isDirty }), 'utf8')
      await fs.rename(temp, target)
      vscode.window.showInformationMessage('Trecho compartilhado por 15 minutos. Diga: Jarvis, explique a seleção do VS Code.')
    } catch (error) { vscode.window.showErrorMessage(`JARVIS: ${error.message}`) }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('jarvis.shareDiagnostics', async () => {
    try {
      const directory = vscode.workspace.getConfiguration('jarvis').get('snapshotDirectory')
      if (!directory || !path.isAbsolute(directory) || path.basename(directory) !== '.jarvis-data') throw new Error('Configure jarvis.snapshotDirectory com a pasta .jarvis-data do JARVIS.')
      const folders = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath).filter((folder) => path.isAbsolute(folder))
      if (!folders.length) throw new Error('Abra uma pasta local no VS Code antes de compartilhar diagnósticos.')
      const diagnostics = []
      let total = 0
      for (const [uri, entries] of vscode.languages.getDiagnostics()) {
        if (uri.scheme !== 'file' || !folders.some((folder) => {
          const relative = path.relative(folder, uri.fsPath)
          return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        })) continue
        for (const diagnostic of entries) {
          total += 1
          if (diagnostics.length >= 200) continue
          const code = typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
            ? String(diagnostic.code).slice(0, 100)
            : typeof diagnostic.code?.value === 'string' || typeof diagnostic.code?.value === 'number'
              ? String(diagnostic.code.value).slice(0, 100) : undefined
          diagnostics.push({
            path: uri.fsPath,
            message: String(diagnostic.message).slice(0, 1200),
            severity: ['error', 'warning', 'info', 'hint'][diagnostic.severity] || 'info',
            source: typeof diagnostic.source === 'string' ? diagnostic.source.slice(0, 100) : '',
            code,
            line: diagnostic.range.start.line + 1,
            column: diagnostic.range.start.character + 1,
            endLine: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1,
          })
        }
      }
      const allowed = await vscode.window.showInformationMessage(
        `Compartilhar até ${diagnostics.length} diagnósticos do VS Code com o JARVIS? O conteúdo será enviado à IA configurada.${total > diagnostics.length ? ` (Há ${total} no total.)` : ''}`,
        { modal: true }, 'Compartilhar diagnósticos',
      )
      if (allowed !== 'Compartilhar diagnósticos') return
      await fs.mkdir(directory, { recursive: true })
      const target = path.join(directory, 'editor-diagnostics.json')
      const temp = path.join(directory, 'editor-diagnostics.tmp')
      await fs.writeFile(temp, JSON.stringify({ diagnostics, total, truncated: total > diagnostics.length, time: Date.now() }), 'utf8')
      await fs.rename(temp, target)
      vscode.window.showInformationMessage('Diagnósticos compartilhados por 15 minutos. Peça ao JARVIS para analisar os diagnósticos do VS Code.')
    } catch (error) { vscode.window.showErrorMessage(`JARVIS: ${error.message}`) }
  }))
}
