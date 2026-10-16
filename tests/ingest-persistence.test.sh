#!/usr/bin/env bash
# Public submit endpoint, persistence, migrations, fail-fast config, health, CSV, timezone, path traversal, rate limits. Needs a build first (npm run build). Run via tests/run-all.sh.
set -u
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRATCH="${LANGHAO_TEST_TMP:-${TMPDIR:-/tmp}}"; SCRATCH="${SCRATCH%/}/langhao-tests"; mkdir -p "$SCRATCH"
W="$SCRATCH/s2work"
PKG="$W/release"
DATA="$W/data"          # deliberately OUTSIDE the release dir, like /var/lib/langhao
PORT=4200
BASE="http://127.0.0.1:$PORT"
PW="correct-horse-battery-9"
LOG="$W/server.log"

PASS=0; FAIL=0
check() { if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (expected: $2 | got: $3)"; fi; }
has()   { if printf '%s' "$3" | grep -qE -- "$2"; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (pattern: $2 | in: ${3:0:200})"; fi; }
hasnt() { if printf '%s' "$3" | grep -qE -- "$2"; then FAIL=$((FAIL+1)); echo "  FAIL  $1   (unexpected: $2)"; else PASS=$((PASS+1)); echo "  PASS  $1"; fi; }

stop_server() {
  [ -f "$W/.pid" ] && kill "$(cat "$W/.pid")" 2>/dev/null
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9 2>/dev/null
  sleep 0.4
}
start_server() { # env assignments...
  stop_server
  ( cd "$PKG" && nohup env -i PATH="$PATH" HOME="$HOME" "$@" PORT=$PORT HOSTNAME=127.0.0.1 node server.js > "$LOG" 2>&1 & echo $! > "$W/.pid" )
  for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/healthz" && return 0; sleep 0.25; done
  echo "    (server did not come up)"; tail -5 "$LOG"; return 1
}
expect_boot_failure() { # desc, grep-pattern, env assignments...
  local desc="$1" pattern="$2"; shift 2
  stop_server
  ( cd "$PKG" && env -i PATH="$PATH" HOME="$HOME" "$@" PORT=$PORT HOSTNAME=127.0.0.1 node server.js > "$LOG" 2>&1; echo $? > "$W/.exit" ) &
  local pid=$!
  for i in $(seq 1 40); do kill -0 $pid 2>/dev/null || break; sleep 0.25; done
  if kill -0 $pid 2>/dev/null; then kill -9 $pid 2>/dev/null; echo "  FAIL  $desc (server kept running)"; FAIL=$((FAIL+1)); return; fi
  wait $pid 2>/dev/null
  local code; code=$(cat "$W/.exit" 2>/dev/null)
  check "$desc: exits non-zero" "yes" "$([ "${code:-0}" != "0" ] && echo yes || echo "no(code=$code)")"
  has   "$desc: clear message in log" "$pattern" "$(cat "$LOG")"
}
assemble() {
  rm -rf "$PKG"; mkdir -p "$PKG"
  cp -R "$REPO/.next/standalone/." "$PKG/"
  cp -R "$REPO/public" "$PKG/public"
  mkdir -p "$PKG/.next"; cp -R "$REPO/.next/static" "$PKG/.next/static"
  rm -rf "$PKG/data"
}
sql() { node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$1');const r=d.prepare(process.argv[1]).all();console.log(r.length===1?Object.values(r[0])[0]:JSON.stringify(r))" "$2" 2>/dev/null; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
post() { curl -s -w "\n%{http_code}" -X POST "$BASE/api/leads" "$@"; }   # prints body\ncode
last() { tail -n1; }
body() { sed '$d'; }
login() { curl -s -c "$W/jar.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/login" -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}"; }
auth() { curl -s -b "$W/jar.txt" "$@"; }
authcode() { curl -s -b "$W/jar.txt" -o /dev/null -w "%{http_code}" "$@"; }
files_in_uploads() { find "$DATA/uploads" -type f 2>/dev/null | wc -l | tr -d ' '; }
lead_count() { sql "$DATA/leads.db" "SELECT COUNT(*) FROM leads"; }

# ---------- fixtures ----------
mkdir -p "$W/fx"; FX="$W/fx"
base64 -d > "$FX/ok.png" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
EOF
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > "$FX/ok.jpg"
printf 'RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x00\x00\x00\x00\x00\x00' > "$FX/ok.webp"
printf '\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' > "$FX/ok.heic"
printf 'this is a plain text file, not a photo at all' > "$FX/fake.jpg"
printf '<html><script>alert(1)</script></html>' > "$FX/page.html"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > "$FX/evil.svg"
{ printf '\xff\xd8\xff\xe0'; head -c 13000000 /dev/zero; } > "$FX/big13.jpg"
{ printf '\xff\xd8\xff\xe0'; head -c 11000000 /dev/zero; } > "$FX/big11.jpg"

echo "== Assemble release from the real build =="
assemble
rm -rf "$DATA"; mkdir -p "$DATA"

echo
echo "== 1. Fail-fast configuration (production) =="
expect_boot_failure "no DATA_DIR"          "DATA_DIR is not set" ADMIN_PASSWORD="$PW"
expect_boot_failure "relative DATA_DIR"    "must be an absolute path" DATA_DIR=relative/path ADMIN_PASSWORD="$PW"
mkdir -p "$W/ro" && chmod 555 "$W/ro"
if [ "$(id -u)" != "0" ]; then
  expect_boot_failure "unwritable DATA_DIR" "EACCES|permission|EPERM|read-only" DATA_DIR="$W/ro/sub" ADMIN_PASSWORD="$PW"
fi
chmod 755 "$W/ro"

echo
echo "== 2. Healthy start, health endpoint =="
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
has   "startup line reports data dir + schema + admin state" "\[startup\] data dir: $DATA \| schema v2 \| admin: enabled" "$(cat "$LOG")"
check "healthz 200" 200 "$(code $BASE/api/healthz)"
check "healthz body" '{"status":"ok"}' "$(curl -s $BASE/api/healthz)"
check "healthz not cacheable" "no-store" "$(curl -sI $BASE/api/healthz | grep -i '^cache-control' | tr -d '\r' | awk '{print $2}')"
check "data dir + db + uploads created outside the release dir" "yes" "$([ -f "$DATA/leads.db" ] && [ -d "$DATA/uploads/products" ] && [ ! -e "$PKG/data" ] && echo yes || echo no)"
check "database is in WAL mode" "wal" "$(sql "$DATA/leads.db" 'PRAGMA journal_mode')"
check "schema version stamped" "2" "$(sql "$DATA/leads.db" 'PRAGMA user_version')"
start_server DATA_DIR="$DATA"
check "healthz degraded when admin not configured -> 503" 503 "$(code $BASE/api/healthz)"
has   "...and says which check failed (no paths/secrets)" '"failed":\["admin_config"\]' "$(curl -s $BASE/api/healthz)"
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW" MIN_FREE_DISK_MB=99999999
check "healthz degraded when disk is nearly full -> 503" 503 "$(code $BASE/api/healthz)"
has   "...reports disk_space" 'disk_space' "$(curl -s $BASE/api/healthz)"
HOLD_ROWS=$(sql "$DATA/leads.db" "SELECT COUNT(*) FROM leads")
check "submissions refused (503) when disk is nearly full" 503 "$(code -X POST $BASE/api/leads -F name=x)"
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"

echo
echo "== 3. Visitor submission: happy paths =="
R=$(post -F name=Alice -F company=Acme -F email=alice@example.com -F country=Australia \
      -F clientSubmissionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1 \
      -F 'requestedInformation=["报价","定制方案"]' -F 'productModels=["RX-200","RX-200","VLX-9"]' -F message="hello 你好" \
      -F "businessCard=@$FX/ok.png;type=image/png" -F "productImages=@$FX/ok.jpg;type=image/jpeg" -F "productImages=@$FX/ok.webp;type=image/webp")
check "submit -> 200" 200 "$(echo "$R" | last)"
REF=$(echo "$R" | body | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).reference))")
ID=$(echo "$R"  | body | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
has   "server returns a reference like LC-YYYYMMDD-XXXXX" '^LC-[0-9]{8}-[A-HJ-NP-Z2-9]{5}$' "$REF"
check "3 photos stored" 3 "$(files_in_uploads)"
check "duplicate model numbers de-duplicated" '["RX-200","VLX-9"]' "$(sql "$DATA/leads.db" 'SELECT product_models FROM leads')"
check "reference persisted with the lead" "$REF" "$(sql "$DATA/leads.db" 'SELECT reference FROM leads')"
CARDPATH=$(sql "$DATA/leads.db" 'SELECT business_card_path FROM leads')
has   "business card stored as uuid + detected extension" '^business-cards/[0-9a-f-]{36}\.png$' "$CARDPATH"

R2=$(post -F name=Bob -F company=B -F email=b@example.com -F country=CN -F "businessCard=@$FX/ok.heic;type=image/heic")
check "HEIC accepted" 200 "$(echo "$R2" | last)"
R3=$(post -F "businessCard=@$FX/ok.jpg;type=image/jpeg")
check "business card alone is enough (no other fields)" 200 "$(echo "$R3" | last)"

echo
echo "== 4. Upload validation: nothing bad reaches disk or the database =="
BEFORE_FILES=$(files_in_uploads); BEFORE_ROWS=$(lead_count)
V() { post -F name=V -F company=V -F email=v@example.com -F country=CN "$@"; }
check "text file renamed .jpg rejected"            400 "$(V -F "productImages=@$FX/fake.jpg;type=image/jpeg" | last)"
has   "...as invalid_file_type"                    "invalid_file_type" "$(V -F "productImages=@$FX/fake.jpg;type=image/jpeg" | body)"
check "HTML with image/jpeg content-type rejected" 400 "$(V -F "productImages=@$FX/page.html;type=image/jpeg" | last)"
check "SVG rejected"                               400 "$(V -F "productImages=@$FX/evil.svg;type=image/svg+xml" | last)"
check "one bad file poisons the whole submission"  400 "$(V -F "productImages=@$FX/ok.png;type=image/png" -F "productImages=@$FX/fake.jpg;type=image/jpeg" | last)"
check "13 MB file -> 413"                          413 "$(V -F "productImages=@$FX/big13.jpg;type=image/jpeg" | last)"
check "11 MB file is fine (under the 12 MB cap)"   200 "$(V -F "productImages=@$FX/big11.jpg;type=image/jpeg" | last)"
check "rejected submissions left no files"         "$((BEFORE_FILES + 1))" "$(files_in_uploads)"
check "rejected submissions left no rows"          "$((BEFORE_ROWS + 1))" "$(lead_count)"
ARGS=(); for i in $(seq 1 11); do ARGS+=(-F "productImages=@$FX/ok.jpg;type=image/jpeg"); done
check "11 product photos -> 400"                   400 "$(V "${ARGS[@]}" | last)"
has   "...as too_many_images"                      "too_many_images" "$(V "${ARGS[@]}" | body)"
check "non-multipart body -> 415"                  415 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/leads -H 'Content-Type: application/json' -d '{"name":"x"}')"
{ printf '\xff\xd8\xff\xe0'; head -c 31000000 /dev/zero; } > "$FX/huge31.jpg"
check "whole request over 30 MB -> 413"            413 "$(V -F "productImages=@$FX/huge31.jpg;type=image/jpeg" | last)"
rm -f "$FX/huge31.jpg"
N1=$(files_in_uploads)
check "hostile filename is ignored"                200 "$(V -F "productImages=@$FX/ok.png;filename=../../../../tmp/pwned.sh;type=text/x-sh" | last)"
check "...file stored under uploads with a uuid name" "yes" "$(find "$DATA/uploads" -type f -newer "$W/.pid" | grep -Eq '/products/[0-9a-f-]{36}\.png$' && [ ! -e /tmp/pwned.sh ] && echo yes || echo no)"
check "...exactly one new file" "$((N1+1))" "$(files_in_uploads)"

echo
echo "== 5. Field validation (server-side, not just the form) =="
check "missing required fields -> 400"            400 "$(post -F name=OnlyName | last)"
has   "...lists company, email, country"          '"fields":\[' "$(post -F name=OnlyName | body)"
check "invalid email -> 400"                      400 "$(post -F name=A -F company=B -F email=not-an-email -F country=C | last)"
LONG=$(head -c 101 /dev/zero | tr '\0' 'a')
check "name over 100 chars -> 400"                400 "$(post -F name=$LONG -F company=B -F email=a@b.co -F country=C | last)"
check "unknown request type -> 400"              400 "$(post -F name=A -F company=B -F email=a@b.co -F country=C -F 'requestedInformation=["hack"]' | last)"
check "malformed JSON list -> 400"                400 "$(post -F name=A -F company=B -F email=a@b.co -F country=C -F 'productModels=not json' | last)"
check "bad client submission id -> 400"           400 "$(post -F name=A -F company=B -F email=a@b.co -F country=C -F 'clientSubmissionId=has spaces!' | last)"

echo
echo "== 6. Idempotent retries =="
ROWS=$(lead_count); FILES=$(files_in_uploads)
R=$(post -F name=Alice -F company=Acme -F email=alice@example.com -F country=Australia -F clientSubmissionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1 -F "businessCard=@$FX/ok.png;type=image/png")
check "repeat of an accepted submission -> 200"   200 "$(echo "$R" | last)"
has   "...flagged duplicate, same reference"      "\"duplicate\":true.*$REF|$REF.*\"duplicate\":true" "$(echo "$R" | body)"
check "...no new lead"                            "$ROWS" "$(lead_count)"
check "...no new files"                           "$FILES" "$(files_in_uploads)"
for i in 1 2 3 4 5; do post -F name=P -F company=P -F email=p@example.com -F country=P -F clientSubmissionId=ppppppppppppppppppppppppppppppp9 -F "productImages=@$FX/ok.png;type=image/png" >/dev/null & done; wait
check "5 simultaneous retries -> exactly one lead" 1 "$(sql "$DATA/leads.db" "SELECT COUNT(*) FROM leads WHERE client_submission_id='ppppppppppppppppppppppppppppppp9'")"
check "...and no orphaned files from the losers"  "$((FILES + 1))" "$(files_in_uploads)"
# every file on disk must belong to exactly one lead
ORPHANS=$(node -e "
const {DatabaseSync}=require('node:sqlite');const fs=require('fs'),path=require('path');
const d=new DatabaseSync('$DATA/leads.db');const known=new Set();
for(const r of d.prepare('SELECT business_card_path c, product_image_paths p FROM leads').all()){ if(r.c)known.add(r.c); JSON.parse(r.p).forEach(x=>known.add(x)); }
let orphans=0; for(const k of ['business-cards','products']) for(const f of fs.readdirSync('$DATA/uploads/'+k)) if(!known.has(k+'/'+f)) orphans++;
console.log(orphans)" 2>/dev/null)
check "no orphan files on disk (every file belongs to a lead)" 0 "$ORPHANS"

echo
echo "== 7. Concurrency: 12 visitors at once =="
BEFORE=$(lead_count)
for i in $(seq 1 12); do
  ( curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/leads" -F name=Conc$i -F company=C -F email=c$i@example.com -F country=CN \
      -F "businessCard=@$FX/ok.png;type=image/png" -F "productImages=@$FX/ok.jpg;type=image/jpeg" >> "$W/conc.txt" ) &
done; wait
check "all 12 accepted" "12" "$(grep -c '^200$' "$W/conc.txt")"
check "12 leads stored" "$((BEFORE+12))" "$(lead_count)"
check "all references unique" "0" "$(sql "$DATA/leads.db" 'SELECT COUNT(*) - COUNT(DISTINCT reference) FROM leads')"
rm -f "$W/conc.txt"

echo
echo "== 8. Admin: CSV, timezone, reference, photos =="
check "admin login" 200 "$(login)"
post --form-string 'name==HYPERLINK("http://evil.example","click")' --form-string "company=+cmd|' /C calc'!A0" \
     --form-string email=csv@example.com --form-string country=CN --form-string phone="+86 138 0013 8000" \
     --form-string jobTitle="@SUM(1+1)" --form-string "message=-2+3" >/dev/null
CSV=$(auth "$BASE/api/admin/export")
has   "CSV starts with the BOM + new reference column" $'^\xEF\xBB\xBF咨询编号,提交时间\\(北京时间\\),状态' "$CSV"
has   "formula in name neutralised"            "'=HYPERLINK" "$CSV"
has   "formula in company neutralised"         "'\\+cmd" "$CSV"
has   "formula in job title neutralised"       "'@SUM" "$CSV"
has   "formula-like message neutralised"       "'-2\\+3" "$CSV"
has   "ordinary international phone left intact" ",\+86 138 0013 8000," "$CSV"
hasnt "no raw '=HYPERLINK' cell start"          '(^|,)=HYPERLINK' "$CSV"
LEADROW=$(sql "$DATA/leads.db" "SELECT id || '|' || created_at || '|' || reference FROM leads WHERE email='alice@example.com'")
LID=${LEADROW%%|*}; REST=${LEADROW#*|}; CREATED=${REST%%|*}
EXPECT=$(node -e "console.log(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date('$CREATED')))")
has   "CSV time is Beijing time ($EXPECT)"     "$REF,$EXPECT," "$CSV"
# the server's own TZ must not matter (EC2 runs UTC; this Mac does not)
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW" TZ=America/Los_Angeles
login >/dev/null
has   "...even when the server clock zone is America/Los_Angeles" "$REF,$EXPECT," "$(auth "$BASE/api/admin/export")"
PAGE=$(auth "$BASE/admin/leads/$LID")
has   "detail page shows Beijing time"          "$EXPECT" "$PAGE"
has   "detail page shows the reference"         "$REF" "$PAGE"
has   "list page shows the reference"           "$REF" "$(auth $BASE/admin)"
has   "detail page photos link to full size"    'href="/api/admin/uploads/products/' "$PAGE"
HDR=$(auth -D - -o /dev/null "$BASE/api/admin/uploads/$CARDPATH")
has   "photo served as image/png"               "content-type: image/png" "$(echo "$HDR" | tr 'A-Z' 'a-z')"
has   "photo has nosniff"                       "x-content-type-options: nosniff" "$(echo "$HDR" | tr 'A-Z' 'a-z')"

echo
echo "== 9. Path traversal against the photo route =="
echo "secret" > "$DATA/uploads/products/secret.txt"
mkdir -p "$DATA/uploads-evil" && printf '\xff\xd8\xff\xe0pwned-sibling' > "$DATA/uploads-evil/leak.jpg"
for u in \
  "/api/admin/uploads/../leads.db" \
  "/api/admin/uploads/products/../../leads.db" \
  "/api/admin/uploads/%2e%2e/leads.db" \
  "/api/admin/uploads/products/..%2f..%2fleads.db" \
  "/api/admin/uploads/..%2fuploads-evil/leak.jpg" \
  "/api/admin/uploads/%2fetc%2fpasswd" \
  "/api/admin/uploads/products/secret.txt" \
  "/api/admin/uploads/products/..%5c..%5cleads.db"; do
  C=$(curl -s --path-as-is -o /dev/null -w "%{http_code}" -b "$W/jar.txt" "$BASE$u")
  check "blocked: $u" "no" "$([ "$C" == "200" ] && echo yes || echo no)"
done
rm -rf "$DATA/uploads-evil" "$DATA/uploads/products/secret.txt"

echo
echo "== 10. Rate limiting on the public endpoint =="
RL="$W/rl"; rm -rf "$RL"; mkdir -p "$RL"
start_server DATA_DIR="$RL" ADMIN_PASSWORD="$PW"
LAST=""; FIRST429=""
for i in $(seq 1 65); do
  c=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/leads -H 'X-Forwarded-For: 203.0.113.77' -F name=x)
  [ "$c" == "429" ] && [ -z "$FIRST429" ] && FIRST429=$i
done
check "61st request from one client is the first 429" 61 "${FIRST429:-never}"
check "another client is unaffected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/leads -H 'X-Forwarded-For: 198.51.100.8' -F name=x)"
RA=$(curl -s -D - -o /dev/null -X POST $BASE/api/leads -H 'X-Forwarded-For: 203.0.113.77' -F name=x | tr -d '\r' | grep -i '^retry-after' | awk '{print $2}')
check "Retry-After present and <= 600" "ok" "$([ -n "$RA" ] && [ "$RA" -ge 1 ] && [ "$RA" -le 600 ] && echo ok || echo "bad:$RA")"
start_server DATA_DIR="$RL" ADMIN_PASSWORD="$PW"
check "limit survives a restart" 429 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/leads -H 'X-Forwarded-For: 203.0.113.77' -F name=x)"

echo
echo "== 11. Persistence across a release replacement (the deploy case) =="
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
ROWS=$(lead_count); FILES=$(files_in_uploads); SUM=$(sql "$DATA/leads.db" "SELECT group_concat(id) FROM (SELECT id FROM leads ORDER BY id)" | shasum | awk '{print $1}')
stop_server
rm -rf "$PKG"            # throw the whole release away...
assemble                 # ...and install a fresh one
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
check "same number of leads after deploying a new release"  "$ROWS"  "$(lead_count)"
check "same number of photos"                                "$FILES" "$(files_in_uploads)"
check "identical lead ids"                                   "$SUM"   "$(sql "$DATA/leads.db" "SELECT group_concat(id) FROM (SELECT id FROM leads ORDER BY id)" | shasum | awk '{print $1}')"
login >/dev/null
check "admin still sees the leads"                           200 "$(authcode $BASE/api/admin/leads)"
check "old photo still served"                               200 "$(authcode "$BASE/api/admin/uploads/$CARDPATH")"

echo
echo "== 12. Upgrading a database written by an older build =="
mk_legacy() { # dir, with_admin_tables
  rm -rf "$1"; mkdir -p "$1"
  node -e "
const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$1/leads.db');
d.exec(\`CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT '新线索', name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', wechat TEXT NOT NULL DEFAULT '', business_card_path TEXT, product_image_paths TEXT NOT NULL DEFAULT '[]', product_models TEXT NOT NULL DEFAULT '[]', requested_information TEXT NOT NULL DEFAULT '[]', message TEXT NOT NULL DEFAULT '')\`);
const ins=d.prepare('INSERT INTO leads (id,created_at,status,name,company,email,country,product_image_paths,message) VALUES (?,?,?,?,?,?,?,?,?)');
ins.run('11111111-aaaa-bbbb-cccc-000000000001','2026-09-18T08:03:58.244Z','已联系','王明','环球工业','wang@globalind.com','中国','[\"products/old1.png\"]','老数据一');
ins.run('22222222-aaaa-bbbb-cccc-000000000002','2026-09-19T02:10:00.000Z','新线索','Test User','Test Co','t@example.com','China','[]','legacy two');
if ($2) d.exec(\`CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE TABLE admin_login_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, client_key TEXT NOT NULL, failed_at INTEGER NOT NULL); CREATE TABLE admin_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)\`);
d.close()" 2>/dev/null
  mkdir -p "$1/uploads/products"; echo old > "$1/uploads/products/old1.png"
}
for variant in 0 1; do
  L="$W/legacy$variant"; mk_legacy "$L" $variant
  [ "$variant" == 0 ] && echo "  (legacy DB from the first offline build: leads table only)" || echo "  (legacy DB from the Stage 1 build: with admin tables, user_version 0)"
  start_server DATA_DIR="$L" ADMIN_PASSWORD="$PW"
  check "  upgraded to schema v2"                   2 "$(sql "$L/leads.db" 'PRAGMA user_version')"
  check "  both old leads intact"                   2 "$(sql "$L/leads.db" 'SELECT COUNT(*) FROM leads')"
  check "  old content untouched (name/status/msg)" "王明|已联系|老数据一" "$(sql "$L/leads.db" "SELECT name||'|'||status||'|'||message FROM leads WHERE id LIKE '1111%'")"
  check "  every old lead got a unique reference"  2 "$(sql "$L/leads.db" "SELECT COUNT(DISTINCT reference) FROM leads WHERE reference IS NOT NULL")"
  has   "  reference carries the Beijing date"     "^LC-20260918-" "$(sql "$L/leads.db" "SELECT reference FROM leads WHERE id LIKE '1111%'")"
  login >/dev/null
  has   "  admin API lists them with references"   '"reference":"LC-' "$(auth $BASE/api/admin/leads)"
  check "  old photo still served"                 200 "$(authcode $BASE/api/admin/uploads/products/old1.png)"
  check "  new submissions work on the upgraded DB" 200 "$(post -F name=New -F company=N -F email=n@example.com -F country=CN | last)"
done

echo
echo "== 13. A database from a NEWER build is never opened by older code =="
mk_legacy "$W/future" 1; node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$W/future/leads.db');d.exec('PRAGMA user_version = 99')" 2>/dev/null
expect_boot_failure "future schema" "schema v99.*only understands up to v2" DATA_DIR="$W/future" ADMIN_PASSWORD="$PW"
check "...and the future database was not modified" 99 "$(sql "$W/future/leads.db" 'PRAGMA user_version')"

stop_server
echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
