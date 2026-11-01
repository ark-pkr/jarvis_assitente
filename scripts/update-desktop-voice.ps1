$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$installationDirectory = Join-Path $env:LOCALAPPDATA 'Programs\JARVIS'
$executable = Join-Path $installationDirectory 'JARVIS.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'JARVIS instalado nao encontrado.' }
$resources = Join-Path $installationDirectory 'resources\app'
if (-not (Resolve-Path -LiteralPath $resources).Path.StartsWith($installationDirectory + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destino invalido.' }
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name = 'JARVIS.exe'" | Where-Object { $_.ExecutablePath -eq $executable })) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'dist'))) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $resources 'dist') -Recurse -Force }
foreach ($module in @('transcribe.mjs', 'assistant.mjs', 'server.mjs', 'studio.mjs')) { Copy-Item -LiteralPath (Join-Path $projectDirectory ('bridge\' + $module)) -Destination (Join-Path $resources ('bridge\' + $module)) -Force }
Copy-Item -LiteralPath (Join-Path $projectDirectory 'desktop\main.cjs') -Destination (Join-Path $resources 'desktop\main.cjs') -Force
$previousMode = $env:ELECTRON_RUN_AS_NODE
try { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process'); Start-Process -FilePath $executable -WindowStyle Normal }
finally { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $previousMode, 'Process') }
Write-Output 'Captura e revisao de voz atualizadas no aplicativo instalado. Dados pessoais preservados.'
