$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\JarvisDedicatedTrayV1', [ref]$created)
if (-not $created) { $mutex.Dispose(); exit }
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Information
$tray.Text = 'JARVIS - assistente dedicado'
$tray.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Abrir JARVIS')
$open.Add_Click({ & (Join-Path $PSScriptRoot 'start-jarvis.ps1') })
$exit = $menu.Items.Add('Sair da bandeja (servicos continuam)')
$exit.Add_Click({ [System.Windows.Forms.Application]::Exit() })
$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ & (Join-Path $PSScriptRoot 'start-jarvis.ps1') })
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({
    try {
        $state = Invoke-RestMethod -Uri 'http://localhost:8787/assistant/alerts' -TimeoutSec 2
        foreach ($notification in @($state.notifications)) {
            if ($seen.Add([string]$notification.id)) {
                $tray.ShowBalloonTip(10000, 'Lembrete do JARVIS', [string]$notification.title, [System.Windows.Forms.ToolTipIcon]::Info)
            }
        }
    } catch { }
})
try { $timer.Start(); [System.Windows.Forms.Application]::Run() }
finally { $timer.Stop(); $timer.Dispose(); $tray.Visible = $false; $tray.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
