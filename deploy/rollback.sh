#!/usr/bin/env bash
# Switch back to the previous release (or a named one) without touching data.
#   sudo rollback.sh [release-name]
# Database changes are additive-only, so older code runs against a newer
# database. To restore *data* as well, see restore.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
if is_root || [ "${LANGHAO_TEST:-}" = "1" ]; then :; else die "run as root (sudo)"; fi

TARGET_NAME="${1:-}"
if [ -n "$TARGET_NAME" ]; then
  TARGET="$LANGHAO_ROOT/releases/$TARGET_NAME"
else
  TARGET="$(readlink "$LANGHAO_ROOT/previous" 2>/dev/null || true)"
fi
[ -n "$TARGET" ] && [ -d "$TARGET" ] || { echo "Available releases:"; ls -1t "$LANGHAO_ROOT/releases" 2>/dev/null; die "no release to roll back to"; }

CURRENT="$(current_release)"
[ "$TARGET" != "$CURRENT" ] || die "already running $(basename "$TARGET")"

log "rolling back: $(basename "$CURRENT") -> $(basename "$TARGET")"
ln -sfn "$TARGET" "$LANGHAO_ROOT/current.tmp"
mv -T "$LANGHAO_ROOT/current.tmp" "$LANGHAO_ROOT/current" 2>/dev/null || { rm -f "$LANGHAO_ROOT/current"; ln -s "$TARGET" "$LANGHAO_ROOT/current"; }
ln -sfn "$CURRENT" "$LANGHAO_ROOT/previous"
"$SYSTEMCTL" restart "$SERVICE" || true

if wait_healthy 45; then
  log "healthy on $(basename "$TARGET")"
else
  die "not healthy after rollback — see: journalctl -u $SERVICE -n 50"
fi
