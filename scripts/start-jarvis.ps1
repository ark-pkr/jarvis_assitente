$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$runtimeDirectory = Join-Path $projectDirectory '.jarvis-data'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:8787/health' -TimeoutSec 2
    $alreadyRunning = $health.app -eq 'jarvis'
} catch { $alreadyRunning = $false }
if (-not $alreadyRunning) {
    $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
    $process = Start-Process -FilePath $nodeExecutable -ArgumentList @('scripts/start.mjs') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'startup.log') -RedirectStandardError (Join-Path $runtimeDirectory 'startup-error.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'launcher.pid')
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "JARVIS nao iniciou. Consulte os logs em $runtimeDirectory" }
$chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chromeExecutable = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList @('-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $PSScriptRoot 'jarvis-tray.ps1') + '"')) -WindowStyle Hidden
if ($chromeExecutable) { Start-Process -FilePath $chromeExecutable -ArgumentList @('--app=http://localhost:5173/') -WindowStyle Normal }
else { Start-Process 'http://localhost:5173/' }
