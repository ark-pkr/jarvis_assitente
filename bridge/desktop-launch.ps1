$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if (-not [System.IO.Path]::IsPathRooted($request.executable) -or [System.IO.Path]::GetExtension($request.executable) -ne '.exe') { throw 'Executavel invalido.' }
    function Quote-Argument([string]$value) {
        # Windows CommandLineToArgvW quoting, without invoking cmd.exe.
        return '"' + (($value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
    }
    $arguments = (@($request.args) | ForEach-Object { Quote-Argument ([string]$_) }) -join ' '
    # Explorer brokers the launch so quitting Electron does not close opened apps.
    $shell = New-Object -ComObject Shell.Application
    $shell.ShellExecute([string]$request.executable, $arguments, [System.IO.Path]::GetDirectoryName($request.executable), 'open', 1)
    [Console]::Write('{"requested":true,"brokered":true}')
} catch { [Console]::Write('{"error":"O Windows nao conseguiu solicitar a abertura do aplicativo."}'); exit 1 }
