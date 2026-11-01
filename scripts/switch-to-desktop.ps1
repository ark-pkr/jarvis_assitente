$ErrorActionPreference = 'Stop'
$installedExecutable = Join-Path $env:LOCALAPPDATA 'Programs\JARVIS\JARVIS.exe'
if (-not (Test-Path -LiteralPath $installedExecutable)) { throw 'Instale o aplicativo desktop antes de desligar a versao de desenvolvimento.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectDirectory '.jarvis-data\launcher.pid'
if (Test-Path -LiteralPath $pidFile) {
    $launcherId = [int](Get-Content -LiteralPath $pidFile)
    $launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $launcherId"
    if ($launcher) {
        if ($launcher.Name -ne 'node.exe' -or $launcher.CommandLine -notmatch 'scripts/start\.mjs') { throw 'PID nao corresponde ao JARVIS de desenvolvimento. Nada foi encerrado.' }
        $services = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $launcherId" | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '(bridge/server\.mjs|node_modules[\\/]vite[\\/]bin[\\/]vite\.js)' })
        Stop-Process -Id $launcherId -Force
        foreach ($service in $services) { Stop-Process -Id $service.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}
$trayScript = Join-Path $PSScriptRoot 'jarvis-tray.ps1'
foreach ($candidate in @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' })) {
    if ($candidate.CommandLine -match '\s-File\s+"([^"\r\n]+\\jarvis-tray\.ps1)"\s*$' -and $Matches[1] -eq $trayScript) { Stop-Process -Id $candidate.ProcessId -Force }
}
& (Join-Path $PSScriptRoot 'install-dedicated.ps1') -RemoveStartup
$previousElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
    [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
    Start-Process -FilePath $installedExecutable -WindowStyle Normal
} finally { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $previousElectronMode, 'Process') }
Write-Output 'Versao desktop iniciada. Servicos antigos encerrados; Word, VS Code e outros aplicativos foram preservados.'
