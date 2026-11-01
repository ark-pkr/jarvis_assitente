$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectDirectory '.jarvis-data\launcher.pid'
if (Test-Path -LiteralPath $pidFile) {
    $launcherId = [int](Get-Content -LiteralPath $pidFile)
    $launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $launcherId"
    if ($launcher) {
        if ($launcher.Name -ne 'node.exe' -or $launcher.CommandLine -notmatch 'scripts/start\.mjs') { throw 'Launcher PID does not match JARVIS. Nothing was stopped.' }
        $services = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $launcherId" | Where-Object {
            $_.Name -eq 'node.exe' -and $_.CommandLine -match '(bridge/server\.mjs|node_modules[\\/]vite[\\/]bin[\\/]vite\.js)'
        })
        # Stop only JARVIS Node services. Never kill the descendant application tree:
        # that tree may contain Word, VS Code or other apps opened by the user.
        Stop-Process -Id $launcherId -Force
        foreach ($service in $services) { Stop-Process -Id $service.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}
& (Join-Path $PSScriptRoot 'start-jarvis.ps1')
