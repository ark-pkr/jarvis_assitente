$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ProgressPreference = 'SilentlyContinue'
$word = $null
$document = $null
function Get-DocumentId($doc, $app) {
    $windowId = if ($doc.Windows.Count -gt 0) { [string]$doc.Windows.Item(1).Hwnd } else { [string]$app.Hwnd }
    $identity = $windowId + '|' + [string]$doc.FullName
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Get-TextHash([string]$text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Describe-Document($doc, $app, [bool]$includeText) {
    $result = @{ id = Get-DocumentId $doc $app; name = [string]$doc.Name; path = [string]$doc.Path; saved = [bool]$doc.Saved; readOnly = [bool]$doc.ReadOnly; characters = [int]$doc.Characters.Count }
    if ($includeText) {
        if ($result.characters -gt 100000) { throw 'Document too large for this text integration (100000 characters maximum).' }
        $allText = [string]$doc.Content.Text
        $result.hash = Get-TextHash $allText
        $result.text = $allText.Substring(0, [Math]::Min(16000, $allText.Length))
        $result.truncated = $allText.Length -gt 16000
    }
    return $result
}
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.action -notin @('list', 'new', 'inspect', 'append', 'saveAs')) { throw 'Unsupported operation.' }
    try { $word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application') }
    catch {
        if ($request.action -ne 'new') { throw 'No accessible Word instance. Open Word or request a new document.' }
        $word = New-Object -ComObject Word.Application
    }
    if ($request.action -eq 'new') {
        $word.Visible = $true
        $document = $word.Documents.Add()
        $document.Activate()
        $result = Describe-Document $document $word $true
    } elseif ($request.action -eq 'list') {
        $documents = @()
        foreach ($doc in $word.Documents) {
            $entry = Describe-Document $doc $word $false
            $entry.active = $doc.FullName -eq $word.ActiveDocument.FullName
            $documents += $entry
        }
        $result = @{ documents = $documents }
    } else {
        foreach ($doc in $word.Documents) {
            if ((Get-DocumentId $doc $word) -eq $request.documentId) { $document = $doc; break }
        }
        if (-not $document) { throw 'Document not found or changed identity. List documents again.' }
        $snapshot = Describe-Document $document $word $true
        if ($request.action -eq 'inspect') { $result = $snapshot }
        else {
            if ($snapshot.readOnly) { throw 'Document is read-only.' }
            if ($snapshot.hash -ne $request.expectedHash) { throw 'Document changed after preview. Nothing was applied.' }
            $word.Visible = $true
            $document.Activate()
            if ($request.action -eq 'append') {
                $text = [string]$request.text
                if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt 20000) { throw 'Invalid text.' }
                $text = $text -replace "`r`n|`n", "`r"
                if ($request.newParagraph -and $snapshot.text.Trim().Length -gt 0) { $text = "`r" + $text }
                $end = [Math]::Max(0, [int]$document.Content.End - 1)
                $range = $document.Range($end, $end)
                $word.UndoRecord.StartCustomRecord('JARVIS - inserir texto')
                try { $range.InsertAfter($text) } finally { $word.UndoRecord.EndCustomRecord() }
                $result = Describe-Document $document $word $true
                $result.inserted = $true
            } else {
                $destination = [string]$request.destination
                if ([IO.Path]::GetExtension($destination) -ne '.docx' -or [IO.File]::Exists($destination)) { throw 'Destination already exists or is not DOCX.' }
                $format = 16
                $document.SaveAs2([ref]$destination, [ref]$format)
                $result = Describe-Document $document $word $false
                $result.savedTo = $destination
            }
        }
    }
    @{ ok = $true; result = $result } | ConvertTo-Json -Depth 8 -Compress | Write-Output
} catch {
    @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress | Write-Output
    exit 1
} finally {
    # Never quit Word or close the user's documents.
    if ($document) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) } catch {} }
    if ($word) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch {} }
}
