param([switch]$RemoveStartup)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory 'JARVIS Assistente.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'start-jarvis.ps1') + '"'
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Arguments -ne $arguments) { throw 'Atalho existente pertence a outra configuracao. Nada foi alterado.' }
if ($RemoveStartup) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Inicializacao automatica removida.'
    exit
}
$shortcut.TargetPath = (Get-Command powershell.exe).Source
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $projectDirectory
$shortcut.WindowStyle = 7
$shortcut.Description = 'JARVIS: interface, servicos e lembretes ao entrar no Windows'
$shortcut.Save()
Write-Output "Inicializacao automatica configurada: $shortcutPath"

$extensionSource = Join-Path $projectDirectory 'integrations\vscode'
$packageDirectory = Join-Path $projectDirectory '.jarvis-data\integrations'
New-Item -ItemType Directory -Force -Path $packageDirectory | Out-Null
$packagePath = Join-Path $packageDirectory 'jarvis-local.vsix'
$manifest = Get-Content -LiteralPath (Join-Path $extensionSource 'package.json') -Raw | ConvertFrom-Json
$manifest.contributes.configuration.properties.'jarvis.snapshotDirectory'.default = Join-Path $projectDirectory '.jarvis-data'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $packagePath) { Remove-Item -LiteralPath $packagePath }
$archive = [System.IO.Compression.ZipFile]::Open($packagePath, [System.IO.Compression.ZipArchiveMode]::Create)
function Add-PackageText($entryPath, $text) {
    $entry = $archive.CreateEntry($entryPath)
    $writer = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
    try { $writer.Write($text) } finally { $writer.Dispose() }
}
try {
    Add-PackageText 'extension/package.json' ($manifest | ConvertTo-Json -Depth 20)
    Add-PackageText 'extension/extension.cjs' (Get-Content -LiteralPath (Join-Path $extensionSource 'extension.cjs') -Raw -Encoding UTF8)
    Add-PackageText '[Content_Types].xml' '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
    Add-PackageText 'extension.vsixmanifest' '<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="pt-BR" Id="jarvis-local" Version="0.1.0" Publisher="jarvis"/><DisplayName>JARVIS Local</DisplayName><Description xml:space="preserve">Compartilhar selecao com o JARVIS local</Description><Tags>education</Tags><Categories>Education</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.80.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'
} finally { $archive.Dispose() }
$codeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue
if (-not $codeCommand) { Write-Output "VS Code CLI nao encontrado. Instale manualmente o pacote $packagePath"; exit }
& $codeCommand.Source --install-extension $packagePath --force
if ($LASTEXITCODE -ne 0) { throw 'VS Code recusou a instalacao da extensao local.' }
Write-Output 'Extensao local registrada no VS Code. Recarregue a janela para ativar o comando.'
