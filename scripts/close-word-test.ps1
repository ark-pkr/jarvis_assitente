$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$root = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) '.ui-check.local')) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath([string]$request.path)
if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($target) -ne 'word-integration.docx') { throw 'Not a JARVIS test document.' }
$app = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
try {
    foreach ($doc in $app.Documents) {
        if ($doc.FullName -eq $target) {
            if (-not $doc.Saved) { throw 'Test document has unsaved changes. Left open.' }
            $option = 0
            $doc.Close([ref]$option)
            Write-Output 'Test document closed; other documents preserved.'
            break
        }
    }
} finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
