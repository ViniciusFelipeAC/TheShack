# Abre a Shack: sobe o servidor se ainda não estiver no ar e abre o app numa janela própria.
# É o que o atalho da Área de Trabalho roda (crie com "npm run shortcut").
# -NoBrowser só sobe o servidor, sem abrir janela. -Stop desliga o servidor.
param([switch]$NoBrowser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'data\server.log'

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

function Get-Server {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) { Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue }
}

# Derruba o servidor desta porta e o cmd que o subiu, e espera a porta ficar livre. Devolve $false se ela não liberar.
# O cmd é achado subindo pelos pais do processo da porta até o título que ele recebe ao subir. Assim um servidor
# de teste em outra porta não derruba o de verdade, e a janela minimizada das versões antigas do atalho também fecha.
function Stop-Server {
  $server = Get-Server
  if (-not $server) { return $true }
  $procs = @{}
  Get-CimInstance Win32_Process | ForEach-Object { $procs[[int]$_.ProcessId] = $_ }
  $target = $server.Id
  $p = $procs[[int]$server.Id]
  for ($i = 0; $p -and $i -lt 10; $i++) {
    if ($p.CommandLine -like '*title The Shack (servidor)*') { $target = $p.ProcessId; break }
    $p = $procs[[int]$p.ParentProcessId]
  }
  # Pelo cmd: no PowerShell 5.1, o aviso de "processo não encontrado" viraria erro e pararia o script.
  cmd.exe /c "taskkill /PID $target /T /F >nul 2>&1"
  $deadline = (Get-Date).AddSeconds(15)
  while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $deadline) { return $false }
    Start-Sleep -Milliseconds 300
  }
  $true
}

if ($Stop) {
  if (-not (Stop-Server)) { Show-Error "Não consegui desligar o servidor na porta $port. Encerre o Node.js no Gerenciador de Tarefas."; exit 1 }
  exit 0
}

# Fechar a janela do app não desliga o servidor: ele segue sem janela, em segundo plano, até o "open.ps1 -Stop".
# Se o código do servidor mudou depois que ele subiu, o atalho o reinicia; senão, a mudança nunca apareceria.
if (Test-Shack) {
  $server = Get-Server
  if ($server -and (Get-Newest @('apps\server\src', 'packages\shared\src')) -gt $server.StartTime) {
    if (-not (Stop-Server)) { Show-Error "Não consegui reiniciar o servidor antigo na porta $port. Encerre o Node.js no Gerenciador de Tarefas e tente de novo."; exit 1 }
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
  # Sem janela, a pedido do usuário: antes era uma janela minimizada que ficava na barra de tarefas.
  # Com Hidden, o Windows nem entrega o console ao Windows Terminal. A saída vai para data\server.log,
  # recriado a cada partida; o título não aparece, só marca o cmd para o Stop-Server.
  New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
  $proc = Start-Process cmd.exe -ArgumentList '/c title The Shack (servidor) && npm.cmd start > data\server.log 2>&1' -WorkingDirectory $root -WindowStyle Hidden -PassThru

  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Shack)) {
    # Se ele caiu ao subir (porta ocupada, .env inválido), não adianta esperar o prazo.
    if ($proc.HasExited) { Show-Error "O servidor caiu ao subir. Veja o erro em $log."; exit 1 }
    if ((Get-Date) -gt $deadline) { Show-Error "O servidor não respondeu em $url. Veja o registro em $log."; exit 1 }
    Start-Sleep -Milliseconds 500
  }
}

if ($NoBrowser) { exit 0 }

# Janela de app do Edge, sem abas nem barra de endereço. Sem Edge, vai o navegador padrão.
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Start-Process $edge -ArgumentList "--app=$url" } else { Start-Process $url }
