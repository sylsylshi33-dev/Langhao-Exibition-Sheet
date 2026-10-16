#!/usr/bin/env bash
# Shared settings and helpers for the deploy/ scripts. Every value can be
# overridden from the environment; production uses the defaults below.

LANGHAO_ROOT="${LANGHAO_ROOT:-/opt/langhao}"
ENV_FILE="${ENV_FILE:-/etc/langhao/langhao.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/langhao}"
NODE_BIN="${NODE_BIN:-/opt/node/bin/node}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SERVICE="${SERVICE:-langhao}"
SERVICE_USER="${SERVICE_USER:-langhao}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/healthz}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"

log()  { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

is_root() { [ "$(id -u)" = "0" ]; }

# Read one KEY=value from the service env file without sourcing it (so the
# admin password never enters this script's environment).
read_env_value() {
  [ -r "$ENV_FILE" ] || return 1
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

data_dir() {
  local value
  value="${DATA_DIR:-$(read_env_value DATA_DIR || true)}"
  [ -n "$value" ] || value="/var/lib/langhao"
  printf '%s' "$value"
}

# Run a command as the service user when we are root (so files in the data
# directory — notably SQLite's -wal/-shm — never become root-owned).
as_service_user() {
  if is_root && id "$SERVICE_USER" >/dev/null 2>&1; then
    runuser -u "$SERVICE_USER" -- "$@"
  else
    "$@"
  fi
}

# Wait until /api/healthz reports ok. $1 = seconds to wait.
wait_healthy() {
  local deadline=$(( $(date +%s) + ${1:-40} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

current_release() { readlink "$LANGHAO_ROOT/current" 2>/dev/null || true; }
