const { spawn } = require('node:child_process')

/**
 * Keeps one Windows scheduled task, "JARVIS Lembrete", pointed at the next
 * dated reminder. When it fires it starts JARVIS hidden in the tray with
 * REMINDER_ARG; the bridge then finds the reminder overdue and the tray shows
 * the notification as usual. That is what lets a reminder appear after the
 * user has chosen "Sair do JARVIS". With JARVIS already running, the second
 * instance just exits, so the task firing is harmless.
 *
 * StartWhenAvailable runs a task missed while the computer was off as soon as
 * it is back. With "acordar o computador" on, WakeToRun also wakes it from
 * sleep for the reminder; it never turns on a computer that is shut down.
 *
 * Both values reach PowerShell as environment variables, never inside the
 * script text, so neither the path nor the date can change what runs.
 */
const TASK_NAME = 'JARVIS Lembrete'
const REMINDER_ARG = '--lembrete'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$name = '${TASK_NAME}'
if (-not $env:JARVIS_REMINDER_AT) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}
$at = [DateTime]::Parse($env:JARVIS_REMINDER_AT, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime()
$action = New-ScheduledTaskAction -Execute $env:JARVIS_REMINDER_EXE -Argument '${REMINDER_ARG}'
$trigger = New-ScheduledTaskTrigger -Once -At $at
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun:($env:JARVIS_REMINDER_WAKE -eq '1')
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Abre o JARVIS na bandeja para mostrar o próximo lembrete.' -Force | Out-Null
`

/** Builds the PowerShell call; split out so it can be checked without running it. */
function scheduleCommand(at, exe, wake = false) {
  if (at !== null && !Number.isFinite(Date.parse(at))) throw new Error('Data do lembrete inválida.')
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
    env: { ...process.env, JARVIS_REMINDER_AT: at ?? '', JARVIS_REMINDER_EXE: exe, JARVIS_REMINDER_WAKE: wake ? '1' : '0' },
  }
}

/** Creates a scheduler that only calls PowerShell when the next time changes. */
function createReminderTask({ exe, log = () => {}, run = spawn, wake = () => false }) {
  let current
  let busy = Promise.resolve()
  return function schedule(at) {
    const next = at || null
    const waking = Boolean(next) && wake()
    // Turning waking on or off has to reach Windows even when the time stays the same.
    const key = next && `${next}${waking ? ' acordando' : ''}`
    if (key === current) return busy
    current = key
    const command = scheduleCommand(next, exe, waking)
    busy = busy.then(() => new Promise((resolve) => {
      const child = run(command.file, command.args, { env: command.env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let error = ''
      child.stderr?.on('data', (text) => { error += text })
      child.on('error', (err) => { log(`Agendador do Windows indisponível: ${err.message}`); current = undefined; resolve() })
      child.on('exit', (code) => {
        if (code === 0) log(next ? `Próximo lembrete agendado no Windows para ${next}${waking ? ', acordando o computador' : ''}.` : 'Nenhum lembrete futuro; tarefa do Windows removida.')
        else { log(`Falha ao agendar o lembrete no Windows (${code}): ${error.trim().slice(0, 300)}`); current = undefined }
        resolve()
      })
    }))
    return busy
  }
}

module.exports = { createReminderTask, scheduleCommand, REMINDER_ARG, TASK_NAME }
