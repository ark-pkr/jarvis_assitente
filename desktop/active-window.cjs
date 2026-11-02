const { execFile } = require('node:child_process')

const command = [
  // Window titles carry accents, and the console's default code page would mangle them.
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public static class JarvisForegroundWindow { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'",
  '$handle = [JarvisForegroundWindow]::GetForegroundWindow()',
  'if ($handle -eq [IntPtr]::Zero) { exit 0 }',
  '$text = New-Object System.Text.StringBuilder 512',
  '[void][JarvisForegroundWindow]::GetWindowText($handle, $text, $text.Capacity)',
  '$processId = 0',
  '[void][JarvisForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processId)',
  '$process = Get-Process -Id $processId -ErrorAction SilentlyContinue',
  'if ($process) { [pscustomobject]@{ process = $process.ProcessName; title = $text.ToString() } | ConvertTo-Json -Compress }',
].join('; ')

function getActiveWindow(run = execFile) {
  return new Promise((resolve, reject) => {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 4096,
    }, (error, stdout) => {
      if (error) return reject(new Error(`Não foi possível consultar a janela ativa: ${error.message}`))
      const output = String(stdout ?? '').trim()
      if (!output) return resolve(null)
      try {
        const result = JSON.parse(output)
        if (typeof result.process !== 'string' || typeof result.title !== 'string') throw new Error('Formato inválido.')
        resolve({ process: result.process.slice(0, 100), title: result.title.slice(0, 240) })
      } catch (parseError) {
        reject(new Error(`A consulta da janela ativa retornou dados inválidos: ${parseError.message}`))
      }
    })
  })
}

module.exports = { getActiveWindow }
