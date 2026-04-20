#!/usr/bin/env zsh
emulate -L zsh -o errexit -o nounset -o pipefail

readonly ROOT_DIR="${0:A:h}"
readonly STATE_DIR="$ROOT_DIR/.self-host"
readonly CONFIG_FILE="$STATE_DIR/config.env"
readonly LOG_DIR="$STATE_DIR/logs"
readonly BIN_DIR="$STATE_DIR/bin"
readonly LOCK_CHECKSUM_FILE="$STATE_DIR/pnpm-lock.sha256"
readonly CADDYFILE="${CADDYFILE:-$HOME/Caddyfile}"
readonly DEFAULT_PUBLIC_URL='http://kaboom.pinky.lilf.ir'
readonly DEFAULT_BACKEND_PORT='18084'
readonly DEFAULT_DEV_PORT='4174'
readonly SERVER_SESSION='kaboom-server'
readonly DEV_SESSION='kaboom-vite'
readonly CADDY_BEGIN='# BEGIN kaboom self-host'
readonly CADDY_END='# END kaboom self-host'
readonly NODE_VERSION="${NODE_VERSION:-$(<"$ROOT_DIR/.nvmrc")}"

tmuxnew () {
	tmux kill-session -t "$1" &> /dev/null || true
	tmux new -d -s "$@"
}

usage() {
  cat <<USAGE
Usage: ./self_host.zsh [setup|redeploy|start|stop|dev-start] [public_url]

setup      Stop existing Kaboom sessions, install/build, update ~/Caddyfile, reload Caddy, then start prod.
redeploy   Rebuild current local checkout, refresh Caddy, and restart prod.
start      Stop prod/dev sessions, refresh Caddy, and start prod from saved artifacts.
stop       Stop all Kaboom tmux sessions.
dev-start  Stop prod/dev sessions, refresh Caddy for dev mode, start Go backend, and start Vite HMR.

Default public_url: $DEFAULT_PUBLIC_URL
If public_url omits a scheme, http:// is assumed.
USAGE
}

log() {
  print -- "==> $*"
}

die() {
  print -u2 -- "Error: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

copy_env_if_unset() {
  local target_name="$1"
  local source_name="$2"
  local source_value="${(P)source_name:-}"

  if [[ -z "${(P)target_name:-}" && -n "$source_value" ]]; then
    export "$target_name=$source_value"
  fi
}

load_proxy() {
  copy_env_if_unset http_proxy HTTP_PROXY
  copy_env_if_unset HTTP_PROXY http_proxy
  copy_env_if_unset https_proxy HTTPS_PROXY
  copy_env_if_unset HTTPS_PROXY https_proxy
  copy_env_if_unset all_proxy ALL_PROXY
  copy_env_if_unset ALL_PROXY all_proxy

  if [[ -z "${npm_config_proxy:-}" ]]; then
    local proxy_value="${https_proxy:-${HTTPS_PROXY:-${http_proxy:-${HTTP_PROXY:-}}}}"
    [[ -n "$proxy_value" ]] && export npm_config_proxy="$proxy_value"
  fi
  if [[ -z "${npm_config_https_proxy:-}" ]]; then
    local proxy_value="${https_proxy:-${HTTPS_PROXY:-${http_proxy:-${HTTP_PROXY:-}}}}"
    [[ -n "$proxy_value" ]] && export npm_config_https_proxy="$proxy_value"
  fi
}

normalize_public_url() {
  local raw_input="${1:-$DEFAULT_PUBLIC_URL}"
  python3 - "$raw_input" <<'PY'
import sys
from urllib.parse import urlparse

raw = sys.argv[1].strip()
if not raw:
    raise SystemExit('public_url must not be empty')
if '://' not in raw:
    raw = 'http://' + raw
parsed = urlparse(raw)
if parsed.scheme not in {'http', 'https'}:
    raise SystemExit('public_url must start with http:// or https://')
if not parsed.netloc:
    raise SystemExit('public_url must include a hostname')
if parsed.path not in ('', '/'):
    raise SystemExit('public_url must not include a path')
if parsed.params or parsed.query or parsed.fragment:
    raise SystemExit('public_url must not include params, query, or fragment')
print(f'{parsed.scheme}://{parsed.netloc}')
PY
}

ensure_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR" "$BIN_DIR"
}

ensure_prereqs() {
  require_cmd tmux
  require_cmd caddy
  require_cmd go
  require_cmd pnpm
  require_cmd python3
  require_cmd curl
  require_cmd sha256sum
  require_cmd ss
  zsh -lc 'source ~/.shared.sh >/dev/null 2>&1 || true; type nvm-load >/dev/null 2>&1' || die 'nvm-load is required in zsh login shells'
}

load_node() {
  source ~/.shared.sh >/dev/null 2>&1 || true
  if ! command -v nvm-load >/dev/null 2>&1; then
    [[ -s "$HOME/.nvm_load" ]] && source "$HOME/.nvm_load"
    [[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
  fi
  command -v nvm-load >/dev/null 2>&1 || die 'nvm-load is required in zsh shells'
  nvm-load >/dev/null 2>&1
  nvm use "$NODE_VERSION" >/dev/null
}

current_lock_checksum() {
  sha256sum "$ROOT_DIR/pnpm-lock.yaml" | awk '{print $1}'
}

run_in_node_shell() {
  local command_string="$1"
  zsh -lc "source ~/.shared.sh >/dev/null 2>&1 || true; nvm-load >/dev/null 2>&1; nvm use ${(q)NODE_VERSION} >/dev/null; cd ${(q)ROOT_DIR}; ${command_string}"
}

port_is_busy() {
  local port="$1"
  ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q LISTEN
}

ensure_port_available() {
  local port="$1"
  local label="$2"
  if port_is_busy "$port"; then
    die "$label port $port is already in use"
  fi
}

persist_config() {
  local public_url="$1"
  cat > "$CONFIG_FILE" <<EOF_CONFIG
PUBLIC_URL='${public_url}'
BACKEND_PORT='${DEFAULT_BACKEND_PORT}'
DEV_PORT='${DEFAULT_DEV_PORT}'
EOF_CONFIG
}

load_config() {
  [[ -f "$CONFIG_FILE" ]] || die "Missing config file: $CONFIG_FILE. Run ./self_host.zsh setup first."
  PUBLIC_URL="$(awk -F= '$1=="PUBLIC_URL" {gsub(/^'\''|'\''$/, "", $2); print $2}' "$CONFIG_FILE")"
  BACKEND_PORT="$(awk -F= '$1=="BACKEND_PORT" {gsub(/^'\''|'\''$/, "", $2); print $2}' "$CONFIG_FILE")"
  DEV_PORT="$(awk -F= '$1=="DEV_PORT" {gsub(/^'\''|'\''$/, "", $2); print $2}' "$CONFIG_FILE")"
}

resolve_public_url() {
  if [[ -n "${1:-}" ]]; then
    normalize_public_url "$1"
  elif [[ -f "$CONFIG_FILE" ]]; then
    load_config
    normalize_public_url "$PUBLIC_URL"
  else
    normalize_public_url "$DEFAULT_PUBLIC_URL"
  fi
}

install_dependencies_if_needed() {
  local checksum current
  checksum="$(current_lock_checksum)"
  current=''
  [[ -f "$LOCK_CHECKSUM_FILE" ]] && current="$(<"$LOCK_CHECKSUM_FILE")"
  if [[ ! -d "$ROOT_DIR/node_modules" || "$checksum" != "$current" ]]; then
    load_proxy
    load_node
    log 'Installing pnpm dependencies...'
    run_in_node_shell 'pnpm install --frozen-lockfile --prefer-offline'
    print -- "$checksum" > "$LOCK_CHECKSUM_FILE"
  else
    log 'pnpm dependencies already match pnpm-lock.yaml; skipping install.'
  fi
}

build_frontend() {
  load_proxy
  load_node
  log 'Building frontend bundle...'
  run_in_node_shell 'pnpm build'
}

build_backend() {
  load_proxy
  log 'Building Go backend...'
  (
    cd "$ROOT_DIR/server"
    KABOOM_ROOT_DIR="$ROOT_DIR" GOWORK=off go mod tidy
    KABOOM_ROOT_DIR="$ROOT_DIR" GOWORK=off go build -o "$BIN_DIR/kaboom-server" .
  )
}

ensure_artifacts_exist() {
  [[ -f "$ROOT_DIR/dist/index.html" ]] || die 'Missing frontend build output. Run ./self_host.zsh setup first.'
  [[ -x "$BIN_DIR/kaboom-server" ]] || die 'Missing backend binary. Run ./self_host.zsh setup first.'
}

tmux_env_exports() {
  local assignments=()
  for key in ALL_PROXY all_proxy http_proxy https_proxy HTTP_PROXY HTTPS_PROXY npm_config_proxy npm_config_https_proxy NO_PROXY no_proxy; do
    local value="${(P)key:-}"
    if [[ -n "$value" ]]; then
      assignments+=("export ${key}=${(q)value};")
    fi
  done
  print -r -- "${(j: :)assignments}"
}

render_caddy_block() {
  local public_url="$1"
  local mode="$2"
  local backend_port="$3"
  local dev_port="$4"
  python3 - "$public_url" "$mode" "$backend_port" "$dev_port" "$ROOT_DIR/dist" <<'PY'
import sys
from urllib.parse import urlparse

public_url, mode, backend_port, dev_port, dist_dir = sys.argv[1:6]
parsed = urlparse(public_url)
host = parsed.netloc
common_backend = f"""    @kaboom_backend {{
        path /api* /ws*
    }}

    handle @kaboom_backend {{
        reverse_proxy 127.0.0.1:{backend_port}
    }}
"""
if mode == 'dev':
    body = common_backend + f"""
    handle {{
        reverse_proxy 127.0.0.1:{dev_port}
    }}
"""
else:
    body = common_backend + f"""
    handle {{
        root * {dist_dir}
        try_files {{path}} /index.html
        file_server
    }}
"""
blocks = []
if parsed.scheme == 'https':
    blocks.append(f"https://{host} {{\n    tls internal\n{body}}}")
    blocks.append(f"http://{host} {{\n{body}}}")
else:
    blocks.append(f"http://{host} {{\n{body}}}")
print('\n\n'.join(blocks))
PY
}

update_caddyfile() {
  local public_url="$1"
  local mode="$2"
  local managed_block
  managed_block="$CADDY_BEGIN
$(render_caddy_block "$public_url" "$mode" "$DEFAULT_BACKEND_PORT" "$DEFAULT_DEV_PORT")
$CADDY_END"

  python3 - "$CADDYFILE" "$CADDY_BEGIN" "$CADDY_END" "$managed_block" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1]).expanduser()
begin = sys.argv[2]
end = sys.argv[3]
block = sys.argv[4]
text = path.read_text() if path.exists() else ''
start = text.find(begin)
finish = text.find(end)
if start != -1 and finish != -1 and finish > start:
    finish += len(end)
    new_text = text[:start].rstrip() + '\n\n' + block + '\n'
    if finish < len(text):
        remainder = text[finish:].lstrip('\n')
        if remainder:
            new_text += '\n' + remainder
else:
    new_text = text.rstrip()
    if new_text:
        new_text += '\n\n'
    new_text += block + '\n'
path.write_text(new_text)
PY
}

reload_caddy() {
  caddy validate --config "$CADDYFILE" --adapter caddyfile
  caddy reload --config "$CADDYFILE" --adapter caddyfile
}

stop_sessions() {
  tmux kill-session -t "$SERVER_SESSION" &>/dev/null || true
  tmux kill-session -t "$DEV_SESSION" &>/dev/null || true
}

wait_for_healthz() {
  local public_url="$1"
  for _ in {1..40}; do
    if curl --noproxy '*' -fsS "http://127.0.0.1:${DEFAULT_BACKEND_PORT}/healthz" >/dev/null 2>&1; then
      log "Backend is healthy."
      return 0
    fi
    sleep 1
  done
  die "Backend did not become healthy in time"
}

start_prod() {
  local public_url="$1"
  ensure_artifacts_exist
  ensure_port_available "$DEFAULT_BACKEND_PORT" 'Backend'
  local exports
  exports="$(tmux_env_exports)"
  tmuxnew "$SERVER_SESSION" zsh -lc "$exports export KABOOM_ADDR=127.0.0.1:${DEFAULT_BACKEND_PORT}; export KABOOM_ROOT_DIR=${(q)ROOT_DIR}; mkdir -p ${(q)LOG_DIR}; cd ${(q)ROOT_DIR}; ${(q)BIN_DIR}/kaboom-server 2>&1 | tee -a ${(q)LOG_DIR}/server.log"
  wait_for_healthz "$public_url"
}

start_dev() {
  local public_url="$1"
  ensure_port_available "$DEFAULT_BACKEND_PORT" 'Backend'
  ensure_port_available "$DEFAULT_DEV_PORT" 'Vite dev'
  local exports
  exports="$(tmux_env_exports)"
  tmuxnew "$SERVER_SESSION" zsh -lc "$exports export KABOOM_ADDR=127.0.0.1:${DEFAULT_BACKEND_PORT}; export KABOOM_ROOT_DIR=${(q)ROOT_DIR}; mkdir -p ${(q)LOG_DIR}; cd ${(q)ROOT_DIR}/server; GOWORK=off go run . 2>&1 | tee -a ${(q)LOG_DIR}/server-dev.log"
  tmuxnew "$DEV_SESSION" zsh -lc "$exports source ~/.shared.sh >/dev/null 2>&1 || true; nvm-load >/dev/null 2>&1; nvm use ${(q)NODE_VERSION} >/dev/null; cd ${(q)ROOT_DIR}; pnpm dev 2>&1 | tee -a ${(q)LOG_DIR}/vite.log"
  wait_for_healthz "$public_url"
}

cmd_setup() {
  local public_url="$1"
  persist_config "$public_url"
  stop_sessions
  install_dependencies_if_needed
  build_backend
  build_frontend
  update_caddyfile "$public_url" prod
  reload_caddy
  start_prod "$public_url"
  log "Kaboom is available at $public_url"
}

cmd_redeploy() {
  local public_url="$1"
  persist_config "$public_url"
  stop_sessions
  install_dependencies_if_needed
  build_backend
  build_frontend
  update_caddyfile "$public_url" prod
  reload_caddy
  start_prod "$public_url"
  log "Kaboom redeployed at $public_url"
}

cmd_start() {
  local public_url="$1"
  persist_config "$public_url"
  stop_sessions
  update_caddyfile "$public_url" prod
  reload_caddy
  start_prod "$public_url"
  log "Kaboom started at $public_url"
}

cmd_dev_start() {
  local public_url="$1"
  persist_config "$public_url"
  stop_sessions
  install_dependencies_if_needed
  update_caddyfile "$public_url" dev
  reload_caddy
  start_dev "$public_url"
  log "Kaboom dev mode is available at $public_url"
}

main() {
  ensure_dirs
  ensure_prereqs

  local command="${1:-}"
  [[ -n "$command" ]] || { usage; exit 1; }
  local public_url
  public_url="$(resolve_public_url "${2:-}")"

  case "$command" in
    setup)
      cmd_setup "$public_url"
      ;;
    redeploy)
      cmd_redeploy "$public_url"
      ;;
    start)
      cmd_start "$public_url"
      ;;
    stop)
      stop_sessions
      ;;
    dev-start)
      cmd_dev_start "$public_url"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
