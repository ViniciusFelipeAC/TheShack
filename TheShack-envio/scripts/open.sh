#!/usr/bin/env bash
# Abre a Shack no Linux: sobe o servidor se ainda não estiver no ar e abre o app.
# É o que o lançador do menu de aplicativos roda (crie com "npm run shortcut"). O do Windows é o open.ps1.
# --no-browser só sobe o servidor, sem abrir janela.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
unit=the-shack
icon="$root/apps/web/public/icons/icon-512.png"

# Mesma porta do servidor: a variável de ambiente, depois o .env, depois o padrão de config.ts.
port=${SHACK_PORT:-}
if [ -z "$port" ] && [ -f "$root/.env" ]; then
  port=$(sed -nE 's/^[[:space:]]*SHACK_PORT[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*$/\1/p' "$root/.env" | head -n1)
fi
port=${port:-4321}
url="http://127.0.0.1:$port"

health() { curl -fs --max-time 2 -o /dev/null "$url/api/v1/health"; }

# Aberto pelo menu, não há terminal: o erro vira notificação.
fail() {
  notify-send -a 'The Shack' -i "$icon" 'The Shack' "$1" 2>/dev/null
  echo "$1" >&2
  exit 1
}

# Algum arquivo das pastas mudou depois da referência? $1 e $2 são o teste do find (-newer arquivo ou -newermt @segundos).
changed() {
  local test=$1 ref=$2 p
  shift 2
  local paths=()
  for p in "$@"; do [ -e "$root/$p" ] && paths+=("$root/$p"); done
  [ ${#paths[@]} -gt 0 ] && [ -n "$(find "${paths[@]}" -type f "$test" "$ref" -print -quit)" ]
}

# Fechar o navegador não desliga o servidor: ele segue no serviço "the-shack" do systemd do usuário.
# Se o código do servidor mudou depois que ele subiu, o lançador o reinicia; senão, a mudança nunca apareceria.
if health; then
  pid=$(ss -ltnpH "sport = :$port" | grep -oP 'pid=\K[0-9]+' | head -n1)
  if [ -n "$pid" ]; then
    started=$(( $(date +%s) - $(ps -o etimes= -p "$pid") ))
    if changed -newermt "@$started" apps/server/src packages/shared/src; then
      if systemctl --user -q is-active "$unit"; then systemctl --user stop "$unit"; else kill "$pid"; fi
      deadline=$(( $(date +%s) + 15 ))
      while [ -n "$(ss -ltnH "sport = :$port")" ]; do
        [ "$(date +%s)" -gt "$deadline" ] && fail "Não consegui reiniciar o servidor antigo na porta $port. Desligue-o e tente de novo."
        sleep 0.3
      done
    fi
  fi
fi

# Gera o app de novo se o código do web ou do shared mudou depois do último build (um git pull, por exemplo).
# O servidor lê o build a cada pedido, então vale mesmo com ele no ar.
dist="$root/apps/web/dist/index.html"
if [ ! -f "$dist" ] || changed -newer "$dist" apps/web/src apps/web/public apps/web/index.html packages/shared/src; then
  (cd "$root" && npm run build) >/dev/null 2>&1 || fail 'Não consegui gerar o app (npm run build). Rode o comando num terminal para ver o erro.'
fi

if ! health; then
  # Serviço sem janela: sobrevive ao lançador, e o systemd guarda o erro se ele cair.
  # O serviço não herda o ambiente do lançador; o PATH e os SHACK_* vão junto.
  if ! systemctl --user -q is-active "$unit"; then
    envs=(--setenv=PATH)
    for name in $(compgen -e); do [[ $name == SHACK_* ]] && envs+=("--setenv=$name"); done
    systemd-run --user --quiet --collect --unit="$unit" --description='The Shack (servidor)' \
      --working-directory="$root" "${envs[@]}" "$(command -v npm)" start ||
      fail 'Não consegui subir o servidor. Rode "npm start" num terminal para ver o erro.'
  fi

  deadline=$(( $(date +%s) + 60 ))
  until health; do
    # Se ele caiu ao subir (porta ocupada, .env inválido), não adianta esperar o prazo.
    systemctl --user -q is-active "$unit" || fail "O servidor caiu ao subir. Veja o erro com: journalctl --user -u $unit"
    [ "$(date +%s)" -gt "$deadline" ] && fail "O servidor não respondeu em $url. Veja o erro com: journalctl --user -u $unit"
    sleep 0.5
  done
fi

[ "${1:-}" = '--no-browser' ] && exit 0

# Janela de app de um navegador Chromium, sem abas nem barra de endereço. Sem nenhum, vai o navegador padrão.
for browser in microsoft-edge-stable google-chrome-stable chromium brave vivaldi-stable \
  com.microsoft.Edge com.google.Chrome org.chromium.Chromium com.brave.Browser; do
  if command -v "$browser" >/dev/null; then
    setsid -f "$browser" --app="$url" >/dev/null 2>&1
    exit 0
  fi
done
xdg-open "$url" 2>/dev/null || gio open "$url"
