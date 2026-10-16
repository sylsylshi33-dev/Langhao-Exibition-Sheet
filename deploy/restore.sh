#!/usr/bin/env bash
# Restore leads + photos from a backup snapshot.
#   sudo restore.sh /var/backups/langhao/<snapshot> [--yes]
# The current data directory is MOVED ASIDE (never deleted), so a mistaken
# restore can itself be undone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

SNAPSHOT="${1:-}"; CONFIRM="${2:-}"
[ -n "$SNAPSHOT" ] || die "usage: restore.sh <backup-dir> [--yes]"
[ -f "$SNAPSHOT/leads.db" ] || die "$SNAPSHOT does not look like a backup (no leads.db)"
[ -d "$SNAPSHOT/uploads" ] || die "$SNAPSHOT does not look like a backup (no uploads/)"
if is_root || [ "${LANGHAO_TEST:-}" = "1" ]; then :; else die "run as root (sudo)"; fi

DATA="$(data_dir)"
ASIDE="$DATA.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"

echo "Snapshot : $SNAPSHOT"
cat "$SNAPSHOT/MANIFEST" 2>/dev/null | sed 's/^/           /' || true
echo "Current  : $DATA   (will be moved to $ASIDE)"
if [ "$CONFIRM" != "--yes" ]; then
  read -r -p "Replace the live data with this snapshot? Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || die "aborted"
fi

log "stopping $SERVICE"
"$SYSTEMCTL" stop "$SERVICE" || true

if [ -e "$DATA" ]; then mv "$DATA" "$ASIDE"; fi
mkdir -p "$DATA"
cp -a "$SNAPSHOT/leads.db" "$DATA/leads.db"
cp -a "$SNAPSHOT/uploads" "$DATA/uploads"
if is_root && id "$SERVICE_USER" >/dev/null 2>&1; then chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA"; fi
chmod 750 "$DATA" 2>/dev/null || true

log "starting $SERVICE"
"$SYSTEMCTL" start "$SERVICE"
if wait_healthy 40; then
  log "restore complete and the app is healthy."
  log "the previous data is preserved at $ASIDE"
else
  die "app did not become healthy after restore — previous data is at $ASIDE; see: journalctl -u $SERVICE -n 50"
fi
