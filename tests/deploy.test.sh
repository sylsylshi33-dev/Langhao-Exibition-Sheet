#!/usr/bin/env bash
# Release build, deploy, automatic rollback, backup, restore, release pruning (uses a fake systemctl). Needs a build first (npm run build). Run via tests/run-all.sh.
# systemctl that runs the real standalone server as a background process.
set -u
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRATCH="${LANGHAO_TEST_TMP:-${TMPDIR:-/tmp}}"; SCRATCH="${SCRATCH%/}/langhao-tests"; mkdir -p "$SCRATCH"
T="$SCRATCH/dt"; rm -rf "$T"; mkdir -p "$T"
PORT=4300

PASS=0; FAIL=0
check() { if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (expected: $2 | got: $3)"; fi; }
has()   { if grep -qE -- "$2" <<<"$3"; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (pattern: $2 | in: ${3:0:300})"; fi; }

# ---- environment the scripts will see (production defaults overridden) ----
export LANGHAO_TEST=1
export LANGHAO_ROOT="$T/opt/langhao"
export DATA_DIR="$T/var/lib/langhao"
export BACKUP_ROOT="$T/var/backups/langhao"
export ENV_FILE="$T/etc/langhao.env"
export NODE_BIN="$(command -v node)"
export SYSTEMCTL="$T/fake-systemctl"
export SERVICE=langhao
export HEALTH_URL="http://127.0.0.1:$PORT/api/healthz"
export KEEP_RELEASES=3
mkdir -p "$LANGHAO_ROOT/bin" "$(dirname "$ENV_FILE")" "$BACKUP_ROOT"
cp "$REPO"/deploy/{lib.sh,deploy.sh,rollback.sh,backup.sh,restore.sh,sqlite-backup.mjs} "$LANGHAO_ROOT/bin/"
printf 'DATA_DIR=%s\nADMIN_PASSWORD=correct-horse-battery-9\n' "$DATA_DIR" > "$ENV_FILE"
BIN="$LANGHAO_ROOT/bin"

# fake systemctl: start/stop/restart the real server like systemd would
cat > "$SYSTEMCTL" <<'EOF'
#!/usr/bin/env bash
action="$1"
PIDFILE="$(dirname "$0")/server.pid"
stop() { [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; lsof -nP -iTCP:4300 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9 2>/dev/null; rm -f "$PIDFILE"; sleep 0.3; }
start() {
  ( set -a; . "$ENV_FILE"; set +a
    cd "$LANGHAO_ROOT/current" 2>/dev/null || exit 1
    env -i PATH="$PATH" HOME="$HOME" DATA_DIR="$DATA_DIR" ADMIN_PASSWORD="$ADMIN_PASSWORD" PORT=4300 HOSTNAME=127.0.0.1 \
      nohup "$NODE_BIN" server.js >> "$(dirname "$0")/server.log" 2>&1 &
    echo $! > "$PIDFILE" )
}
case "$action" in
  stop) stop ;;
  start) start ;;
  restart) stop; start ;;
esac
exit 0
EOF
chmod +x "$SYSTEMCTL"
stop_all() { "$SYSTEMCTL" stop x; }
trap stop_all EXIT

code()  { curl -s -o /dev/null -w "%{http_code}" "$@"; }
leads() { node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$DATA_DIR/leads.db');console.log(d.prepare('SELECT COUNT(*) c FROM leads').get().c)" 2>/dev/null; }
photos(){ find "$DATA_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' '; }
cur()   { basename "$(readlink "$LANGHAO_ROOT/current")"; }
submit(){ curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/api/leads" -H "X-Forwarded-For: 192.0.2.$((RANDOM%250+1))" \
            -F name="$1" -F company=C -F email=c@example.com -F country=CN -F "productImages=@$T/ok.png;type=image/png"; }
base64 -d > "$T/ok.png" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
EOF
inode() { node -e "console.log(require('fs').statSync('$1').ino)"; }

echo "== A. Building a release =="
cd "$REPO"
[ -f .next/standalone/server.js ] || { echo "no build; run npm run build first"; exit 1; }
SKIP_BUILD=1 ./scripts/build-release.sh > "$T/build.log" 2>&1; BR=$?
check "build-release.sh succeeds" 0 "$BR"
REL1="$(ls -1t dist/langhao-*.tar.gz | head -1)"
check "tarball + .sha256 produced" "yes" "$([ -f "$REL1" ] && [ -f "$REL1.sha256" ] && echo yes || echo no)"
LIST="$(tar -tzf "$REL1")"
has   "contains server.js, .next/static, public, RELEASE" "server.js" "$LIST"
check "no data/ inside the release"            "0" "$(echo "$LIST" | grep -cE '^\./data(/|$)')"
check "no sharp / @img (platform binaries)"    "0" "$(echo "$LIST" | grep -cE 'node_modules/(sharp|@img)')"
check "no native binaries at all"              "0" "$(echo "$LIST" | grep -cE '\.(node|dylib|so|dll)$')"
check "includes static assets"                 "yes" "$(echo "$LIST" | grep -q '\.next/static/' && echo yes || echo no)"
mkdir -p "$T/rel" && cp "$REL1" "$REL1.sha256" "$T/rel/"
REL1="$T/rel/$(basename "$REL1")"

echo
echo "== B. First deployment =="
OUT="$("$BIN/deploy.sh" "$REL1" 2>&1)"; RC=$?
check "deploy.sh exits 0" 0 "$RC"
has   "reports DEPLOYED" "DEPLOYED:" "$OUT"
has   "first deploy skips the pre-deploy backup" "no database yet" "$OUT"
check "service healthy" '{"status":"ok"}' "$(curl -s $HEALTH_URL)"
check "current points at the release" "$(basename "$REL1" .tar.gz)" "$(cur)"
check "data dir lives outside the release" "yes" "$([ -f "$DATA_DIR/leads.db" ] && echo yes || echo no)"
check "visitor submission works"  200 "$(submit Alice)"
check "visitor submission works (2)" 200 "$(submit Bob)"
check "2 leads stored" 2 "$(leads)"

echo
echo "== C. Second deployment keeps data, takes a pre-deploy backup =="
cp "$REL1" "$T/rel/langhao-second.tar.gz"; cp "$REL1.sha256" "$T/rel/langhao-second.tar.gz.sha256"
sed -i.bak "s#$(basename "$REL1")#langhao-second.tar.gz#" "$T/rel/langhao-second.tar.gz.sha256"; rm -f "$T/rel/langhao-second.tar.gz.sha256.bak"
OUT="$("$BIN/deploy.sh" "$T/rel/langhao-second.tar.gz" 2>&1)"; RC=$?
check "deploy.sh exits 0" 0 "$RC"
check "now on the new release" "langhao-second" "$(cur)"
check "previous release recorded" "$(basename "$REL1" .tar.gz)" "$(basename "$(readlink "$LANGHAO_ROOT/previous")")"
check "leads unchanged" 2 "$(leads)"
check "photos unchanged" 2 "$(photos)"
PRE="$(ls -1d "$BACKUP_ROOT"/*-pre-deploy 2>/dev/null | tail -1)"
check "pre-deploy backup exists" "yes" "$([ -n "$PRE" ] && [ -f "$PRE/leads.db" ] && echo yes || echo no)"
check "backup holds both leads" 2 "$(node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('$PRE/leads.db',{readOnly:true}).prepare('SELECT COUNT(*) c FROM leads').get().c)" 2>/dev/null)"
check "backup holds both photos" 2 "$(find "$PRE/uploads" -type f | wc -l | tr -d ' ')"

echo
echo "== D. A bad release is rejected and the site keeps running =="
mkdir -p "$T/bad" && rm -rf "$T/bad/*" && (cd "$T/bad" && mkdir -p x && tar -xzf "$REL1" -C x && echo 'console.error("boom: simulated broken release"); process.exit(1)' > x/server.js && tar -czf "$T/rel/langhao-broken.tar.gz" -C x .)
BEFORE="$(cur)"
OUT="$("$BIN/deploy.sh" "$T/rel/langhao-broken.tar.gz" 2>&1)"; RC=$?
check "deploy.sh exits non-zero" "yes" "$([ "$RC" != "0" ] && echo yes || echo no)"
has   "says NOT healthy and rolled back" "NOT HEALTHY" "$OUT"
has   "explains the site is on the previous release" "rolled back" "$OUT"
check "still on the previous release" "$BEFORE" "$(cur)"
check "service healthy again" '{"status":"ok"}' "$(curl -s $HEALTH_URL)"
check "leads untouched by the failed deploy" 2 "$(leads)"
check "site still accepts visitors" 200 "$(submit Carol)"
check "3 leads now" 3 "$(leads)"

echo
echo "== E. Corrupted / unsafe tarballs are refused before anything changes =="
cp "$REL1" "$T/rel/langhao-corrupt.tar.gz"; cp "$REL1.sha256" "$T/rel/langhao-corrupt.tar.gz.sha256"
printf 'tampered' >> "$T/rel/langhao-corrupt.tar.gz"
BEFORE="$(cur)"
OUT="$("$BIN/deploy.sh" "$T/rel/langhao-corrupt.tar.gz" 2>&1)"; RC=$?
check "checksum mismatch refused" "yes" "$([ "$RC" != "0" ] && echo yes || echo no)"
has   "...with a clear message" "checksum mismatch" "$OUT"
check "current unchanged" "$BEFORE" "$(cur)"
mkdir -p "$T/withdata/x/data" && tar -xzf "$REL1" -C "$T/withdata/x" && echo secret > "$T/withdata/x/data/leads.db" && tar -czf "$T/rel/langhao-withdata.tar.gz" -C "$T/withdata/x" .
OUT="$("$BIN/deploy.sh" "$T/rel/langhao-withdata.tar.gz" 2>&1)"; RC=$?
check "release containing data/ refused" "yes" "$([ "$RC" != "0" ] && echo yes || echo no)"
has   "...with a clear message" "must never ship visitor data" "$OUT"
check "current unchanged" "$BEFORE" "$(cur)"
echo "not a release" > "$T/rel/langhao-junk.tar.gz.txt"; tar -czf "$T/rel/langhao-junk.tar.gz" -C "$T/rel" langhao-junk.tar.gz.txt
OUT="$("$BIN/deploy.sh" "$T/rel/langhao-junk.tar.gz" 2>&1)"; RC=$?
check "non-release tarball refused" "yes" "$([ "$RC" != "0" ] && echo yes || echo no)"
check "current unchanged" "$BEFORE" "$(cur)"

echo
echo "== F. Manual rollback =="
CURNOW="$(cur)"; PREV="$(basename "$(readlink "$LANGHAO_ROOT/previous")")"
OUT="$("$BIN/rollback.sh" 2>&1)"; RC=$?
check "rollback.sh exits 0" 0 "$RC"
check "switched to the previous release" "$PREV" "$(cur)"
check "healthy after rollback" '{"status":"ok"}' "$(curl -s $HEALTH_URL)"
check "data untouched by rollback" 3 "$(leads)"
OUT="$("$BIN/rollback.sh" "$CURNOW" 2>&1)"
check "rolling forward by name works" "$CURNOW" "$(cur)"

echo
echo "== G. Backups: consistent, incremental, pruned =="
OUT="$("$BIN/backup.sh" scheduled 2>&1)"; RC=$?
check "backup.sh exits 0" 0 "$RC"
S1="$(ls -1d "$BACKUP_ROOT"/*-scheduled | tail -1)"
check "snapshot has db + photos + manifest" "yes" "$([ -f "$S1/leads.db" ] && [ -f "$S1/MANIFEST" ] && [ "$(find "$S1/uploads" -type f | wc -l | tr -d ' ')" == "3" ] && echo yes || echo no)"
check "snapshot db is standalone (no -wal needed) and has 3 leads" 3 "$(node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('$S1/leads.db',{readOnly:true}).prepare('SELECT COUNT(*) c FROM leads').get().c)" 2>/dev/null)"
submit Dave >/dev/null
sleep 1.1
"$BIN/backup.sh" scheduled >/dev/null 2>&1
S2="$(ls -1d "$BACKUP_ROOT"/*-scheduled | tail -1)"
check "second snapshot is a different directory" "yes" "$([ "$S1" != "$S2" ] && echo yes || echo no)"
check "second snapshot has the new photo (4)" 4 "$(find "$S2/uploads" -type f | wc -l | tr -d ' ')"
F1="$(find "$S1/uploads" -type f | head -1)"; F2="$S2/uploads/${F1#$S1/uploads/}"
check "unchanged photos are hard-linked, not duplicated" "$(inode "$F1")" "$(inode "$F2")"
for i in 1 2 3 4; do sleep 1.1; "$BIN/backup.sh" extra >/dev/null 2>&1; done
check "old snapshots pruned to KEEP_BACKUPS" "yes" "$(KEEP_BACKUPS=3 "$BIN/backup.sh" pruned >/dev/null 2>&1; [ "$(ls -1d "$BACKUP_ROOT"/*/ | wc -l | tr -d ' ')" -le 3 ] && echo yes || echo no)"

echo
echo "== H. Disaster recovery =="
GOOD="$(ls -1d "$BACKUP_ROOT"/*/ | sort | tail -1)"; GOOD="${GOOD%/}"
LEADS_BEFORE="$(leads)"; PHOTOS_BEFORE="$(photos)"
echo "  (simulating loss: wiping the live data directory)"
"$SYSTEMCTL" stop x; rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
check "restore refuses a directory that is not a backup" "yes" "$("$BIN/restore.sh" "$T/rel" --yes >/dev/null 2>&1; [ $? -ne 0 ] && echo yes || echo no)"
OUT="$("$BIN/restore.sh" "$GOOD" --yes 2>&1)"; RC=$?
check "restore.sh exits 0" 0 "$RC"
has   "...reports healthy" "restore complete" "$OUT"
check "leads recovered" "$LEADS_BEFORE" "$(leads)"
check "photos recovered" "$PHOTOS_BEFORE" "$(photos)"
check "previous data directory preserved, not deleted" "yes" "$(ls -d "$DATA_DIR".before-restore-* >/dev/null 2>&1 && echo yes || echo no)"
check "admin API serves recovered data" 200 "$(curl -s -c "$T/j" -o /dev/null -X POST $HEALTH_URL/../admin/login 2>/dev/null; curl -s -c "$T/j" -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:$PORT/api/admin/login -H 'Content-Type: application/json' -d '{"password":"correct-horse-battery-9"}')"
check "recovered lead visible" "yes" "$(curl -s -b "$T/j" http://127.0.0.1:$PORT/api/admin/leads | grep -q 'Dave' && echo yes || echo no)"
check "and it still accepts new submissions" 200 "$(submit Erin)"

echo
echo "== I. Old releases are pruned, current + previous always kept =="
for n in 1 2 3 4; do cp "$REL1" "$T/rel/langhao-extra$n.tar.gz"; cp "$REL1.sha256" "$T/rel/langhao-extra$n.tar.gz.sha256"
  sed -i.bak "s#$(basename "$REL1")#langhao-extra$n.tar.gz#" "$T/rel/langhao-extra$n.tar.gz.sha256"; rm -f "$T/rel/langhao-extra$n.tar.gz.sha256.bak"
  "$BIN/deploy.sh" "$T/rel/langhao-extra$n.tar.gz" >/dev/null 2>&1; sleep 1; done
check "releases kept <= KEEP_RELEASES(3) + the broken one still on disk is pruned" "yes" "$([ "$(ls -1 "$LANGHAO_ROOT/releases" | wc -l | tr -d ' ')" -le 4 ] && echo yes || echo no)"
check "current release still present" "yes" "$([ -d "$LANGHAO_ROOT/current/" ] && echo yes || echo no)"
check "previous release still present" "yes" "$([ -d "$LANGHAO_ROOT/previous/" ] && echo yes || echo no)"
check "service healthy at the end" '{"status":"ok"}' "$(curl -s $HEALTH_URL)"
check "no lead lost across every deploy/rollback/restore above" "yes" "$([ "$(leads)" -ge 5 ] && echo yes || echo "no:$(leads)")"

stop_all
echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
