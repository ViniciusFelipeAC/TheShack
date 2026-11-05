# Cria o atalho "The Shack" na Área de Trabalho, com o ícone de pixel art do app.
# Uso: npm run shortcut. Rode uma vez em cada máquina; o atalho aponta para esta pasta.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# O atalho do Windows só aceita .ico. Um .ico pode carregar PNGs direto, então junta os que já existem.
$pngs = @('favicon-32.png', 'icon-192.png') | ForEach-Object { Join-Path $root "apps\web\public\icons\$_" }
$ico = Join-Path $root 'data\shack.ico'
New-Item -ItemType Directory -Force (Split-Path $ico) | Out-Null
$stream = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($stream)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
$images = $pngs | ForEach-Object { , [System.IO.File]::ReadAllBytes($_) }
foreach ($bytes in $images) {
  # Largura e altura estão no cabeçalho IHDR do PNG (bytes 16 a 23, big-endian).
  $size = ($bytes[16] -shl 24) -bor ($bytes[17] -shl 16) -bor ($bytes[18] -shl 8) -bor $bytes[19]
  $dim = if ($size -ge 256) { 0 } else { $size }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$bytes.Length); $w.Write([uint32]$offset)
  $offset += $bytes.Length
}
foreach ($bytes in $images) { $w.Write($bytes) }
[System.IO.File]::WriteAllBytes($ico, $stream.ToArray())

$desktop = [Environment]::GetFolderPath('Desktop')
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'The Shack.lnk'))
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$(Join-Path $PSScriptRoot 'open.ps1')"""
$link.WorkingDirectory = $root
$link.IconLocation = $ico
$link.Description = 'Abre a Shack (sobe o servidor se precisar)'
$link.Save()
Write-Host "Atalho criado em $desktop\The Shack.lnk"
