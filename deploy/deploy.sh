#!/usr/bin/env bash
# Install a release tarball, switch to it atomically, verify it is healthy,
# and roll back automatically if it is not.
#   sudo /opt/langhao/bin/deploy.sh /path/to/langhao-<version>.tar.gz
#
# Visitor data is never touched: it lives in DATA_DIR (/var/lib/langhao),
# outside every release. A backup is taken before anything changes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

TARBALL="${1:-}"
[ -n "$TARBALL" ] || die "usage: deploy.sh <release-tarball.tar.gz>"
[ -f "$TARBALL" ] || die "no such file: $TARBALL"
if is_root || [ "${LANGHAO_TEST:-}" = "1" ]; then :; else die "run as root (sudo)"; fi

RELEASES="$LANGHAO_ROOT/releases"
mkdir -p "$RELEASES"

# 1. Integrity of what we were given.
if [ -f "$TARBALL.sha256" ]; then
  log "verifying checksum"
  EXPECTED="$(awk '{print $1}' "$TARBALL.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then ACTUAL="$(sha256sum "$TARBALL" | awk '{print $1}')"
  else ACTUAL="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"; fi
  [ "$EXPECTED" = "$ACTUAL" ] || die "checksum mismatch — refusing to deploy a corrupted or tampered release"
else
  log "WARNING: no $(basename "$TARBALL").sha256 next to the tarball; skipping checksum verification"
fi

# 2. Something to roll back to, and data we can restore.
PREVIOUS="$(current_release)"
if [ -f "$(data_dir)/leads.db" ]; then
  log "pre-deploy backup"
  "$HERE/backup.sh" pre-deploy
else
  log "no database yet (first deploy) — skipping pre-deploy backup"
fi

# 3. Unpack beside the running release.
NAME="$(basename "$TARBALL" .tar.gz)"
TARGET="$RELEASES/$NAME"
[ ! -e "$TARGET" ] || TARGET="$RELEASES/$NAME-$(date -u +%H%M%S)"
mkdir -p "$TARGET"
log "unpacking to $TARGET"
tar -xzf "$TARBALL" -C "$TARGET"
[ -f "$TARGET/server.js" ] && [ -d "$TARGET/.next" ] || { rm -rf "$TARGET"; die "tarball is not a valid release (no server.js / .next)"; }
[ -e "$TARGET/data" ] && { rm -rf "$TARGET"; die "release contains a data/ directory — refusing (it must never ship visitor data)"; }
if is_root; then chown -R root:root "$TARGET"; fi
chmod -R a+rX,go-w "$TARGET"

# 4. Switch atomically and restart.
switch_to() { ln -sfn "$1" "$LANGHAO_ROOT/current.tmp" && mv -T "$LANGHAO_ROOT/current.tmp" "$LANGHAO_ROOT/current" 2>/dev/null \
              || { rm -f "$LANGHAO_ROOT/current"; ln -s "$1" "$LANGHAO_ROOT/current"; }; }
log "switching current -> $(basename "$TARGET")"
switch_to "$TARGET"
"$SYSTEMCTL" restart "$SERVICE" || true

# 5. Verify; roll back if unhealthy.
if wait_healthy 45; then
  log "healthy."
  [ -n "$PREVIOUS" ] && ln -sfn "$PREVIOUS" "$LANGHAO_ROOT/previous"
  # prune old releases (never the current or previous)
  KEEP_SET="$(basename "$TARGET") $(basename "${PREVIOUS:-none}")"
  ls -1t "$RELEASES" | awk -v keep="$KEEP_RELEASES" 'NR>keep' | while read -r old; do
    case " $KEEP_SET " in *" $old "*) continue ;; esac
    log "pruning old release $old"; rm -rf "${RELEASES:?}/$old"
  done
  log "DEPLOYED: $(basename "$TARGET")${PREVIOUS:+ (previous: $(basename "$PREVIOUS"))}"
  exit 0
fi

log "NEW RELEASE IS NOT HEALTHY — last log lines:"
journalctl -u "$SERVICE" -n 25 --no-pager 2>/dev/null || true
if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
  log "rolling back to $(basename "$PREVIOUS")"
  switch_to "$PREVIOUS"
  "$SYSTEMCTL" restart "$SERVICE" || true
  if wait_healthy 45; then
    die "deployment FAILED and was rolled back; the site is running the previous release (data untouched)"
  fi
  die "deployment failed AND the rollback is not healthy — investigate immediately: journalctl -u $SERVICE"
fi
die "first deployment failed and there is no previous release to roll back to — see: journalctl -u $SERVICE -n 50"
