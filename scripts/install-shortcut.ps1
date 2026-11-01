$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$desktopDirectory = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDirectory 'JARVIS.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$target = (Get-Command powershell.exe).Source
$arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'start-jarvis.ps1') + '"'
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Arguments -ne $arguments) {
    throw 'Ja existe outro atalho JARVIS na area de trabalho. Nenhum arquivo foi alterado.'
}
$shortcut.TargetPath = $target
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $projectDirectory
$shortcut.WindowStyle = 7
$shortcut.Description = 'Iniciar JARVIS com Gemini no Chrome'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,44"
$shortcut.Save()
Write-Output "Atalho criado: $shortcutPath"
