#!/usr/bin/env bash
# Admin authentication: no default password, sessions, revocation, rotation, throttling, cookies. Needs a build first (npm run build). Run via tests/run-all.sh.
set -u
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRATCH="${LANGHAO_TEST_TMP:-${TMPDIR:-/tmp}}"; SCRATCH="${SCRATCH%/}/langhao-tests"; mkdir -p "$SCRATCH"
PKG="$SCRATCH/stage1_pkg"
PORT=4100
BASE="http://127.0.0.1:$PORT"
STRONG="correct-horse-battery-9"
ROTATED="a-completely-different-pw-77"

PASS=0; FAIL=0
check() { # desc expected actual
  if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (expected: $2 | got: $3)"; fi
}
check_contains() { # desc needle haystack
  if printf '%s' "$3" | grep -qi -- "$2"; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (missing: $2 in: $3)"; fi
}
check_not_contains() {
  if printf '%s' "$3" | grep -qi -- "$2"; then FAIL=$((FAIL+1)); echo "  FAIL  $1   (unexpectedly found: $2)"; else PASS=$((PASS+1)); echo "  PASS  $1"; fi
}

start_server() { # env assignments...
  stop_server
  ( cd "$PKG" && nohup env -u ADMIN_PASSWORD DATA_DIR="$PKG/data" "$@" PORT=$PORT HOSTNAME=127.0.0.1 node server.js > "$SCRATCH/stage1_server.log" 2>&1 & echo $! > "$PKG/.pid" )
  for i in $(seq 1 40); do curl -s -o /dev/null "$BASE/" && return 0; sleep 0.25; done
  echo "server failed to start"; cat "$SCRATCH/stage1_server.log"; exit 1
}
stop_server() {
  [ -f "$PKG/.pid" ] && kill "$(cat "$PKG/.pid")" 2>/dev/null
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9 2>/dev/null
  sleep 0.4
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
login() { # password [extra curl args]  -> prints HTTP code, writes headers to $SCRATCH/h.txt
  local pw="$1"; shift
  curl -s -D "$SCRATCH/h.txt" -o "$SCRATCH/b.txt" -w "%{http_code}" -X POST "$BASE/api/admin/login" \
    -H "Content-Type: application/json" -d "{\"password\":\"$pw\"}" "$@"
}
cookie_from_headers() { grep -i '^set-cookie:' "$SCRATCH/h.txt" | grep -i "$1=" | head -1 | sed -E "s/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/"; }

echo "== Assemble scratch package from the real build =="
rm -rf "$PKG"; mkdir -p "$PKG"
cp -R "$REPO/.next/standalone/." "$PKG/"
cp -R "$REPO/public" "$PKG/public"
mkdir -p "$PKG/.next"; cp -R "$REPO/.next/static" "$PKG/.next/static"
rm -rf "$PKG/data"
# a tiny valid PNG for uploads
base64 -d > "$SCRATCH/t.png" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
EOF

echo
echo "== A. Admin NOT configured (no ADMIN_PASSWORD) =="
start_server
check "visitor form loads"                          200 "$(code $BASE/)"
check "admin login page loads"                      200 "$(code $BASE/admin/login)"
SUBMIT=$(curl -s -w " %{http_code}" -X POST "$BASE/api/leads" -F name=Visitor -F company=Acme -F email=v@example.com -F country=CN \
  -F 'requestedInformation=["报价"]' -F 'productModels=["X1"]' -F "businessCard=@$SCRATCH/t.png;type=image/png" -F "productImages=@$SCRATCH/t.png;type=image/png")
check_contains "visitor can still submit a lead"    '"ok":true' "$SUBMIT"
check "login disabled -> 503 (any password)"        503 "$(login anything-at-all)"
check "login disabled even for the old default"     503 "$(login langhao2026)"
check "/admin without cookie -> redirect"           307 "$(code $BASE/admin)"
check "/api/admin/leads unauthenticated -> 401"     401 "$(code $BASE/api/admin/leads)"
check "/api/admin/export unauthenticated -> 401"    401 "$(code $BASE/api/admin/export)"
check "/api/admin/uploads unauthenticated -> 401"   401 "$(code $BASE/api/admin/uploads/products/x.png)"
check "GET /api/leads has no read handler -> 405"   405 "$(code $BASE/api/leads)"
LEAD_ID=$(node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$PKG/data/leads.db');console.log(d.prepare('SELECT id FROM leads').get().id)" 2>/dev/null)
CARD_PATH=$(node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$PKG/data/leads.db');console.log(d.prepare('SELECT business_card_path p FROM leads').get().p)" 2>/dev/null)
echo "  (lead id: $LEAD_ID, card: $CARD_PATH)"

echo
echo "== B. Weak configuration is rejected =="
start_server ADMIN_PASSWORD=short1
check "11-char-or-less password -> 503"             503 "$(login short1)"
start_server ADMIN_PASSWORD=langhao2026
check "the previously published default -> 503"     503 "$(login langhao2026)"

echo
echo "== C. Strong password: login, cookie, authorization =="
start_server ADMIN_PASSWORD="$STRONG"
check "wrong password -> 401"                       401 "$(login not-the-password)"
check "correct password -> 200"                     200 "$(login "$STRONG")"
SETCOOKIE=$(grep -i '^set-cookie:' "$SCRATCH/h.txt")
check_contains "cookie is HttpOnly"                 "HttpOnly" "$SETCOOKIE"
check_contains "cookie is SameSite=Lax"             "SameSite=Lax" "$SETCOOKIE"
check_contains "cookie has Path=/"                  "Path=/" "$SETCOOKIE"
check_contains "cookie Max-Age is 12h"              "Max-Age=43200" "$SETCOOKIE"
check_not_contains "no Secure flag over plain HTTP (offline PCs / Safari)" "; Secure" "$SETCOOKIE"
check_not_contains "no __Host- prefix over plain HTTP" "__Host-" "$SETCOOKIE"
TOKEN=$(cookie_from_headers admin_session | sed 's/^admin_session=//')
check "token is 43 chars (256-bit base64url)"       43 "${#TOKEN}"
C="Cookie: admin_session=$TOKEN"
check "list API with session"                       200 "$(code -H "$C" $BASE/api/admin/leads)"
check "detail API with session"                     200 "$(code -H "$C" $BASE/api/admin/leads/$LEAD_ID)"
check "photo with session"                          200 "$(code -H "$C" $BASE/api/admin/uploads/$CARD_PATH)"
EXPORT=$(curl -s -H "$C" $BASE/api/admin/export)
check_contains "CSV export with session has the lead" "Visitor" "$EXPORT"
check "admin list page with session"                200 "$(code -H "$C" $BASE/admin)"
check "admin detail page with session"              200 "$(code -H "$C" $BASE/admin/leads/$LEAD_ID)"
check "status change with session"                  200 "$(code -X PATCH -H "$C" -H 'Content-Type: application/json' -d '{"status":"已联系"}' $BASE/api/admin/leads/$LEAD_ID)"
check "invalid status rejected"                     400 "$(code -X PATCH -H "$C" -H 'Content-Type: application/json' -d '{"status":"hacked"}' $BASE/api/admin/leads/$LEAD_ID)"

echo
echo "== D. Forged / stale / legacy credentials =="
FORGED=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
check "well-formed but unknown token: API 401"      401 "$(code -H "Cookie: admin_session=$FORGED" $BASE/api/admin/leads)"
check "well-formed but unknown token: export 401"   401 "$(code -H "Cookie: admin_session=$FORGED" $BASE/api/admin/export)"
check "well-formed but unknown token: photo 401"    401 "$(code -H "Cookie: admin_session=$FORGED" $BASE/api/admin/uploads/$CARD_PATH)"
check "well-formed but unknown token: page redirects" 307 "$(code -H "Cookie: admin_session=$FORGED" $BASE/admin)"
LOC=$(curl -s -o /dev/null -w "%{redirect_url}" -H "Cookie: admin_session=$FORGED" $BASE/admin/leads/$LEAD_ID)
check_contains "  ...and the redirect target is the login page" "/admin/login" "$LOC"
LEGACY=$(printf 'a%.0s' $(seq 1 64))
check "legacy 64-hex cookie format -> 401"          401 "$(code -H "Cookie: admin_session=$LEGACY" $BASE/api/admin/leads)"
check "garbage cookie -> 401"                       401 "$(code -H "Cookie: admin_session=nope" $BASE/api/admin/leads)"
check "unknown token cannot PATCH status"           401 "$(code -X PATCH -H "Cookie: admin_session=$FORGED" -H 'Content-Type: application/json' -d '{"status":"已成交"}' $BASE/api/admin/leads/$LEAD_ID)"

echo
echo "== E. Server-side revocation (proxy cannot know this; the handler must) =="
check "login again for a fresh token"               200 "$(login "$STRONG")"
T2=$(cookie_from_headers admin_session | sed 's/^admin_session=//')
check "fresh token works"                           200 "$(code -H "Cookie: admin_session=$T2" $BASE/api/admin/leads)"
check "logout returns 200"                          200 "$(code -X POST -H "Cookie: admin_session=$T2" $BASE/api/admin/logout)"
check "the SAME well-formed token is dead after logout" 401 "$(code -H "Cookie: admin_session=$T2" $BASE/api/admin/leads)"
check "...also for pages"                           307 "$(code -H "Cookie: admin_session=$T2" $BASE/admin)"

echo
echo "== F. Session lifetime, restart persistence, password rotation =="
check "login for lifetime test"                     200 "$(login "$STRONG")"
T3=$(cookie_from_headers admin_session | sed 's/^admin_session=//')
check "token valid before restart"                  200 "$(code -H "Cookie: admin_session=$T3" $BASE/api/admin/leads)"
start_server ADMIN_PASSWORD="$STRONG"
check "token still valid after server restart"      200 "$(code -H "Cookie: admin_session=$T3" $BASE/api/admin/leads)"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$PKG/data/leads.db');d.prepare('UPDATE admin_sessions SET expires_at = 1').run()" 2>/dev/null
check "expired session -> 401"                      401 "$(code -H "Cookie: admin_session=$T3" $BASE/api/admin/leads)"
check "login for rotation test"                     200 "$(login "$STRONG")"
T4=$(cookie_from_headers admin_session | sed 's/^admin_session=//')
check "token valid before rotation"                 200 "$(code -H "Cookie: admin_session=$T4" $BASE/api/admin/leads)"
start_server ADMIN_PASSWORD="$ROTATED"
check "changing ADMIN_PASSWORD invalidates old sessions" 401 "$(code -H "Cookie: admin_session=$T4" $BASE/api/admin/leads)"
check "old password no longer works"                401 "$(login "$STRONG")"
check "new password works"                          200 "$(login "$ROTATED")"
start_server ADMIN_PASSWORD="$STRONG"
echo "  (back on the original password for the remaining tests)"

echo
echo "== G. Secrets at rest =="
DBFILE="$PKG/data/leads.db*"
check "plaintext password is not in the database file" 0 "$(cat $DBFILE 2>/dev/null | grep -ac "$STRONG")"
check "plaintext old password not in database file"    0 "$(cat $DBFILE 2>/dev/null | grep -ac "$ROTATED")"
check "raw session token is not stored (only its hash)" 0 "$(cat $DBFILE 2>/dev/null | grep -ac -- "$T3")"

echo
echo "== H. HTTPS behind a reverse proxy =="
check "login with X-Forwarded-Proto: https"         200 "$(login "$STRONG" -H 'X-Forwarded-Proto: https')"
SC=$(grep -i '^set-cookie:' "$SCRATCH/h.txt")
check_contains "cookie gets the __Host- prefix"     "__Host-admin_session=" "$SC"
check_contains "cookie is Secure"                   "; Secure" "$SC"
check_contains "cookie keeps HttpOnly"              "HttpOnly" "$SC"
HT=$(cookie_from_headers __Host-admin_session | sed 's/^__Host-admin_session=//')
check "__Host- cookie works over https"             200 "$(code -H "Cookie: __Host-admin_session=$HT" -H 'X-Forwarded-Proto: https' $BASE/api/admin/leads)"
check "plain-named cookie is NOT accepted over https" 401 "$(code -H "Cookie: admin_session=$HT" -H 'X-Forwarded-Proto: https' $BASE/api/admin/leads)"

echo
echo "== I. Login throttling =="
start_server ADMIN_PASSWORD="$STRONG"
for n in 1 2 3 4 5; do check "wrong attempt $n -> 401" 401 "$(login bad$n -H 'X-Forwarded-For: 203.0.113.9')"; done
check "6th attempt blocked -> 429"                  429 "$(login bad6 -H 'X-Forwarded-For: 203.0.113.9')"
RA=$(grep -i '^retry-after:' "$SCRATCH/h.txt" | tr -d '\r' | awk '{print $2}')
check "Retry-After is present and sane (1..900)"    ok "$([ -n "$RA" ] && [ "$RA" -ge 1 ] && [ "$RA" -le 900 ] && echo ok || echo "bad:$RA")"
check "even the CORRECT password is blocked while locked" 429 "$(login "$STRONG" -H 'X-Forwarded-For: 203.0.113.9')"
check "spoofed leading XFF entry does not bypass (rightmost is used)" 429 "$(login "$STRONG" -H 'X-Forwarded-For: 8.8.8.8, 203.0.113.9')"
check "a different client is not locked out"        200 "$(login "$STRONG" -H 'X-Forwarded-For: 198.51.100.7')"
start_server ADMIN_PASSWORD="$STRONG"
check "lock survives a server restart"              429 "$(login "$STRONG" -H 'X-Forwarded-For: 203.0.113.9')"
for n in 1 2 3; do login x$n -H 'X-Forwarded-For: 192.0.2.50' >/dev/null; done
check "success resets that client's counter"        200 "$(login "$STRONG" -H 'X-Forwarded-For: 192.0.2.50')"
for n in 1 2 3 4; do login y$n -H 'X-Forwarded-For: 192.0.2.50' >/dev/null; done
check "...so 4 more failures do not lock (5th would)" 401 "$(login y5 -H 'X-Forwarded-For: 192.0.2.50')"

echo
echo "== J. Misc =="
BIG=$(head -c 6000 /dev/zero | tr '\0' 'a')
start_server ADMIN_PASSWORD="$STRONG"
check "oversized login body -> 413"                 413 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/admin/login -H 'Content-Type: application/json' -d "{\"password\":\"$BIG\"}")"
check "visitor submit still works while admin is configured" 200 "$(code -X POST $BASE/api/leads -F name=Two -F company=B -F email=b@example.com -F country=AU)"
COUNT=$(node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$PKG/data/leads.db');console.log(d.prepare('SELECT COUNT(*) c FROM leads').get().c)" 2>/dev/null)
check "no leads lost or duplicated across all restarts (1 + 1)" 2 "$COUNT"
ORIG=$(node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$PKG/data/leads.db');console.log(d.prepare('SELECT name||company||email FROM leads WHERE id=?').get('$LEAD_ID')['name||company||email'])" 2>/dev/null)
check "original lead content intact"                "VisitorAcmev@example.com" "$ORIG"
echo "  server log (auth-related lines):"; grep "\[admin\]" "$SCRATCH/stage1_server.log" | sort | uniq -c | head -5

stop_server
echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
