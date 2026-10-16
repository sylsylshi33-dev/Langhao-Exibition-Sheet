#!/usr/bin/env bash
# Build the latest code ON the server from GitHub, then deploy it.
#   sudo /opt/langhao/bin/update-from-git.sh [git-ref]      (default: origin/main)
#
# Optional convenience. The alternative (build on your laptop with
# scripts/build-release.sh and copy the tarball over) needs no build tools
# on the server. Building here needs ~1 GB of free memory.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
is_root || die "run as root (sudo)"

REPO_URL="${REPO_URL:-https://github.com/sylsylshi33-dev/Langhao-Exibition-Sheet.git}"
REF="${1:-origin/main}"
SRC="$LANGHAO_ROOT/src"
NODE_DIR="$(dirname "$NODE_BIN")"

command -v git >/dev/null 2>&1 || die "git is not installed: sudo dnf install -y git"
mkdir -p "$SRC"; chown "$SERVICE_USER:$SERVICE_USER" "$SRC"

build() {
  runuser -u "$SERVICE_USER" -- env \
    PATH="$NODE_DIR:/usr/bin:/bin" HOME="$SRC/.home" \
    NODE_OPTIONS="--max-old-space-size=1200" NEXT_TELEMETRY_DISABLED=1 \
    bash -c '
      set -euo pipefail
      mkdir -p "$HOME"
      cd "'"$SRC"'"
      if [ ! -d repo/.git ]; then git clone "'"$REPO_URL"'" repo; fi
      cd repo
      git fetch --tags origin
      git checkout --force --detach "'"$REF"'"
      git clean -fdx -e node_modules
      npm ci --no-audit --no-fund
      ./scripts/build-release.sh
    '
}

log "building $REF from $REPO_URL"
build

TARBALL="$(ls -1t "$SRC"/repo/dist/langhao-*.tar.gz | head -n1)"
log "deploying $(basename "$TARBALL")"
exec "$HERE/deploy.sh" "$TARBALL"
