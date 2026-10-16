#!/usr/bin/env bash
# Daily (systemd timer) and pre-deploy backup of leads + photos.
#   backup.sh [label]
# Writes /var/backups/langhao/<UTC timestamp>[-label]/{leads.db,uploads/,MANIFEST}.
# Unchanged photos are hard-linked to the previous snapshot, so 14 daily
# snapshots cost little more than one. If BACKUP_S3_URI is set in the env
# file (and the aws CLI + an instance role exist) the snapshot is also synced there.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

# Never touch the database as root: that would leave root-owned -wal/-shm files.
if is_root && id "$SERVICE_USER" >/dev/null 2>&1; then
  exec runuser -u "$SERVICE_USER" -- "$0" "$@"
fi

LABEL="${1:-}"
DATA="$(data_dir)"
[ -f "$DATA/leads.db" ] || die "no database at $DATA/leads.db — nothing to back up"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="$STAMP${LABEL:+-$LABEL}"
DEST="$BACKUP_ROOT/$NAME"
mkdir -p "$BACKUP_ROOT"
LATEST="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -n1 || true)"

mkdir -p "$DEST"
trap 'rm -rf "$DEST"' ERR

log "database snapshot -> $DEST/leads.db"
"$NODE_BIN" "$HERE/sqlite-backup.mjs" "$DATA/leads.db" "$DEST/leads.db"

log "photos -> $DEST/uploads"
mkdir -p "$DEST/uploads"
if [ -n "$LATEST" ] && [ -d "$LATEST/uploads" ]; then
  # Re-use the previous snapshot's files via hard links where possible.
  cp -al "$LATEST/uploads/." "$DEST/uploads/" 2>/dev/null || cp -a "$LATEST/uploads/." "$DEST/uploads/"
fi
if [ -d "$DATA/uploads" ]; then
  # Add files not already present. (Written without `cp -n`, whose exit status
  # for skipped files differs between coreutils versions.) Uploaded photos are
  # never modified after they are written, so "exists" means "identical".
  ( cd "$DATA/uploads" && find . -type f -print0 ) | while IFS= read -r -d '' file; do
    if [ ! -e "$DEST/uploads/$file" ]; then
      mkdir -p "$(dirname "$DEST/uploads/$file")"
      cp -a "$DATA/uploads/$file" "$DEST/uploads/$file"
    fi
  done
fi

PHOTOS="$(find "$DEST/uploads" -type f | wc -l | tr -d ' ')"
{
  echo "created_utc=$STAMP"
  echo "photos=$PHOTOS"
  echo "release=$(basename "$(current_release)" 2>/dev/null || true)"
} > "$DEST/MANIFEST"
trap - ERR
log "backup complete: $NAME ($PHOTOS photos)"

if [ -z "${BACKUP_S3_URI:-}" ]; then BACKUP_S3_URI="$(read_env_value BACKUP_S3_URI || true)"; fi
if [ -n "${BACKUP_S3_URI:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    log "syncing to $BACKUP_S3_URI/$NAME"
    aws s3 sync --only-show-errors "$DEST" "$BACKUP_S3_URI/$NAME" || log "WARNING: S3 sync failed (local backup is intact)"
  else
    log "WARNING: BACKUP_S3_URI is set but the aws CLI is not installed"
  fi
fi

# Keep the newest $KEEP_BACKUPS snapshots (never fewer than 3).
[ "$KEEP_BACKUPS" -ge 3 ] 2>/dev/null || KEEP_BACKUPS=3
ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | awk -v keep="$KEEP_BACKUPS" '{a[NR]=$0} END{for(i=1;i<=NR-keep;i++) print a[i]}' | while read -r old; do
  log "pruning old backup $(basename "$old")"
  rm -rf "$old"
done
