# Guarda o token do GitHub usado por `npm run desktop:release`, uma vez só.
#
# O token fica criptografado pelo Windows (DPAPI), preso a esta conta neste
# computador, numa pasta fora do projeto. Só scripts/release.mjs o lê: o
# JARVIS, inclusive o serviço em modo de desenvolvimento, nunca o vê.
#
#   npm run release:token
$ErrorActionPreference = 'Stop'
$folder = Join-Path $env:APPDATA 'JARVIS-release'
$file = Join-Path $folder 'github-token.txt'

if ($env:JARVIS_RELEASE_TOKEN_IN) {
  # Usado só para migrar um token que já estava no .env.local, sem digitá-lo de novo.
  $secure = ConvertTo-SecureString $env:JARVIS_RELEASE_TOKEN_IN -AsPlainText -Force
} else {
  Write-Host 'Cole o token do GitHub (classic, com public_repo) e aperte Enter. Ele não aparece na tela.'
  $secure = Read-Host -AsSecureString 'Token'
}
$plain = [Net.NetworkCredential]::new('', $secure).Password.Trim()
if (-not $plain) { Write-Host 'Nenhum token informado. Nada foi salvo.'; exit 1 }

try {
  $user = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers @{ Authorization = "Bearer $plain"; 'User-Agent' = 'jarvis-release' }
} catch {
  Write-Host 'O GitHub não aceitou esse token. Confira se copiou inteiro e se ele não venceu. Nada foi salvo.'
  exit 1
}

New-Item -ItemType Directory -Force -Path $folder | Out-Null
ConvertTo-SecureString $plain -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $file -Encoding ascii
Write-Host "Token da conta $($user.login) guardado com criptografia do Windows em $file"
Write-Host 'Agora publicar é só: npm run desktop:release'
