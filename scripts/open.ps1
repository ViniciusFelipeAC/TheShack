# Abre a Shack: sobe o servidor se ainda não estiver no ar e abre o app numa janela própria.
# É o que o atalho da Área de Trabalho roda (crie com "npm run shortcut").
# -NoBrowser só sobe o servidor, sem abrir janela.
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Mesma porta do servidor: a variável de ambiente, depois o .env, depois o padrão de config.ts.
$port = 4321
$envFile = Join-Path $root '.env'
if ($env:SHACK_PORT) { $port = [int]$env:SHACK_PORT }
elseif (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*SHACK_PORT\s*=\s*(\d+)' } | Select-Object -First 1
  if ($line -and $line -match '(\d+)\s*$') { $port = [int]$Matches[1] }
}
$url = "http://127.0.0.1:$port"

function Test-Shack {
  try { (Invoke-WebRequest "$url/api/v1/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}

function Show-Error([string]$text) {
  (New-Object -ComObject WScript.Shell).Popup($text, 0, 'The Shack', 16) | Out-Null
}

# Arquivo mais recente das pastas, para saber se o código mudou depois do build ou da partida do servidor.
function Get-Newest([string[]]$paths) {
  $full = $paths | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
  (Get-ChildItem $full -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
}

# Fechar a janela do app não desliga o servidor: ele segue na janela minimizada "The Shack (servidor)".
# Se o código do servidor mudou depois que ele subiu, o atalho o reinicia; senão, a mudança nunca apareceria.
if (Test-Shack) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  $server = if ($listener) { Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue }
  if ($server -and (Get-Newest @('apps\server\src', 'packages\shared\src')) -gt $server.StartTime) {
    $windows = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*title The Shack (servidor)*' }
    # Pelo cmd: no PowerShell 5.1, o aviso de "processo não encontrado" viraria erro e pararia o script.
    foreach ($id in @($windows | ForEach-Object { $_.ProcessId }) + $server.Id) { cmd.exe /c "taskkill /PID $id /T /F >nul 2>&1" }
    $deadline = (Get-Date).AddSeconds(15)
    while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      if ((Get-Date) -gt $deadline) { Show-Error "Não consegui reiniciar o servidor antigo na porta $port. Feche a janela ""The Shack (servidor)"" e tente de novo."; exit 1 }
      Start-Sleep -Milliseconds 300
    }
  }
}

# Gera o app de novo se o código do web ou do shared mudou depois do último build (um git pull, por exemplo).
# O servidor lê o build a cada pedido, então vale mesmo com ele no ar.
$dist = Join-Path $root 'apps\web\dist\index.html'
if (-not (Test-Path $dist) -or (Get-Newest @('apps\web\src', 'apps\web\public', 'apps\web\index.html', 'packages\shared\src')) -gt (Get-Item $dist).LastWriteTime) {
  $build = Start-Process cmd.exe -ArgumentList '/c npm.cmd run build' -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  if ($build.ExitCode -ne 0) { Show-Error 'Não consegui gerar o app (npm run build). Rode o comando num terminal para ver o erro.'; exit 1 }
}

if (-not (Test-Shack)) {
  # Janela minimizada: fechá-la desliga o servidor. O /k mantém o erro na tela se ele cair.
  Start-Process cmd.exe -ArgumentList '/k title The Shack (servidor) && npm.cmd start' -WorkingDirectory $root -WindowStyle Minimized

  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Shack)) {
    if ((Get-Date) -gt $deadline) { Show-Error "O servidor não respondeu em $url. Veja a janela ""The Shack (servidor)"" na barra de tarefas."; exit 1 }
    Start-Sleep -Milliseconds 500
  }
}

if ($NoBrowser) { exit 0 }

# Janela de app do Edge, sem abas nem barra de endereço. Sem Edge, vai o navegador padrão.
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Start-Process $edge -ArgumentList "--app=$url" } else { Start-Process $url }
