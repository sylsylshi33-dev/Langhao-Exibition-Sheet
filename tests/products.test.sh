#!/usr/bin/env bash
# Multi-product enquiries: migration of pre-existing data (schema v2 -> v3), submit validation,
# photo/product association, admin display, and the CSV / Excel / PDF exports.
# Needs a build first (npm run build). Run via tests/run-all.sh.
set -u
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRATCH="${LANGHAO_TEST_TMP:-${TMPDIR:-/tmp}}"; SCRATCH="${SCRATCH%/}/langhao-tests"; mkdir -p "$SCRATCH"
W="$SCRATCH/s4work"
PKG="$W/release"
DATA="$W/data"
PORT=4400
BASE="http://127.0.0.1:$PORT"
PW="correct-horse-battery-9"
LOG="$W/server.log"
FX="$REPO/tests/fixtures"

PASS=0; FAIL=0
check() { if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (expected: $2 | got: $3)"; fi; }
has()   { if printf '%s' "$3" | grep -qE -- "$2"; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1   (pattern: $2 | in: ${3:0:300})"; fi; }
hasnt() { if printf '%s' "$3" | grep -qE -- "$2"; then FAIL=$((FAIL+1)); echo "  FAIL  $1   (unexpected: $2)"; else PASS=$((PASS+1)); echo "  PASS  $1"; fi; }

stop_server() {
  [ -f "$W/.pid" ] && kill "$(cat "$W/.pid")" 2>/dev/null
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9 2>/dev/null
  sleep 0.4
}
start_server() {
  stop_server
  ( cd "$PKG" && nohup env -i PATH="$PATH" HOME="$HOME" "$@" PORT=$PORT HOSTNAME=127.0.0.1 node server.js > "$LOG" 2>&1 & echo $! > "$W/.pid" )
  for i in $(seq 1 80); do curl -s -o /dev/null "$BASE/api/healthz" && return 0; sleep 0.25; done
  echo "    (server did not come up)"; tail -8 "$LOG"; return 1
}
sql() { node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$1');const r=d.prepare(process.argv[1]).all();console.log(r.length===1?Object.values(r[0])[0]:JSON.stringify(r))" "$2" 2>/dev/null; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
# a fresh client key per request, so the (separately tested) rate limiter never interferes
post() { curl -s -w "\n%{http_code}" -X POST "$BASE/api/leads" -H "X-Forwarded-For: 10.$((RANDOM%250)).$((RANDOM%250)).$((RANDOM%250))" "$@"; }
last() { tail -n1; }
body() { sed '$d'; }
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j.'+process.argv[1]))})" "$1"; }
login() { curl -s -c "$W/jar.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/login" -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}"; }
auth() { curl -s -b "$W/jar.txt" "$@"; }
authcode() { curl -s -b "$W/jar.txt" -o /dev/null -w "%{http_code}" "$@"; }
page() { auth "$@" | sed "s/<!-- -->//g" | tr -d "\n"; }
files_in_uploads() { find "$DATA/uploads" -type f 2>/dev/null | wc -l | tr -d ' '; }
lead_count() { sql "$DATA/leads.db" "SELECT COUNT(*) FROM leads"; }
product_count() { sql "$DATA/leads.db" "SELECT COUNT(*) FROM lead_products"; }
sha() { shasum "$1" | awk '{print $1}'; }
stored_sha() { sha "$DATA/uploads/$1"; }
# photo_paths of product <position> of the lead with this reference
photos_of() { sql "$DATA/leads.db" "SELECT p.photo_paths FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$1' AND p.position=$2"; }
nth_photo() { node -e "console.log(JSON.parse(process.argv[1])[Number(process.argv[2])])" "$1" "$2"; }

echo "== Assemble release from the real build =="
rm -rf "$PKG" "$DATA"; mkdir -p "$PKG" "$DATA"
cp -R "$REPO/.next/standalone/." "$PKG/"
cp -R "$REPO/public" "$PKG/public"
mkdir -p "$PKG/.next" "$PKG/assets"; cp -R "$REPO/.next/static" "$PKG/.next/static"; cp -R "$REPO/assets/fonts" "$PKG/assets/fonts"
rm -rf "$PKG/data"
check "release contains the PDF font" "yes" "$([ -s "$PKG/assets/fonts/NotoSansSC-Regular-subset.otf" ] && echo yes || echo no)"
check "release contains no native binaries (exceljs/pdfkit are pure JS)" "0" "$(find "$PKG" \( -name '*.node' -o -name '*.so' -o -name '*.dylib' \) -not -path '*/node_modules/sharp/*' -not -path '*/node_modules/@img/*' | wc -l | tr -d ' ')"

###############################################################################
echo
echo "== 1. Upgrading a real pre-change database (schema v2, old product columns) =="
mkdir -p "$DATA/uploads/products" "$DATA/uploads/business-cards"
cp "$FX/label-a.jpg" "$DATA/uploads/products/old-a.jpg"
cp "$FX/label-b.jpg" "$DATA/uploads/products/old-b.jpg"
cp "$FX/label-c.jpg" "$DATA/uploads/products/old-c.jpg"
cp "$FX/label-d.png" "$DATA/uploads/business-cards/old-card.png"
node -e "
const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$DATA/leads.db');
d.exec(\`
CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT '新线索', name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', wechat TEXT NOT NULL DEFAULT '', business_card_path TEXT, product_image_paths TEXT NOT NULL DEFAULT '[]', product_models TEXT NOT NULL DEFAULT '[]', requested_information TEXT NOT NULL DEFAULT '[]', message TEXT NOT NULL DEFAULT '', reference TEXT, client_submission_id TEXT);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE admin_login_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, client_key TEXT NOT NULL, failed_at INTEGER NOT NULL);
CREATE TABLE admin_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE rate_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, client_key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE UNIQUE INDEX idx_leads_reference ON leads (reference);
CREATE UNIQUE INDEX idx_leads_submission ON leads (client_submission_id) WHERE client_submission_id IS NOT NULL;
\`);
const ins=d.prepare('INSERT INTO leads (id,created_at,status,name,company,email,country,business_card_path,product_image_paths,product_models,requested_information,message,reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
ins.run('11111111-aaaa-bbbb-cccc-000000000001','2026-09-18T08:03:58.244Z','已联系','王明','环球工业','wang@globalind.com','中国','business-cards/old-card.png','[\"products/old-a.jpg\",\"products/old-b.jpg\"]','[\"RX-200\",\"VLX-9\"]','[\"报价\"]','老数据一','LC-20260918-OLD01');
ins.run('22222222-aaaa-bbbb-cccc-000000000002','2026-09-19T02:10:00.000Z','新线索','Model Only','M Co','m@example.com','China',null,'[]','[\"ZZ-1\"]','[]','legacy two','LC-20260919-OLD02');
ins.run('33333333-aaaa-bbbb-cccc-000000000003','2026-09-20T02:10:00.000Z','新线索','No Products','N Co','n@example.com','China',null,'[]','[]','[]','legacy three','LC-20260920-OLD03');
ins.run('44444444-aaaa-bbbb-cccc-000000000004','2026-09-21T02:10:00.000Z','已成交','Photo Only','P Co','p@example.com','China',null,'[\"products/old-c.jpg\"]','[]','[]','legacy four','LC-20260921-OLD04');
ins.run('55555555-aaaa-bbbb-cccc-000000000005','2026-09-22T02:10:00.000Z','新线索','','','','','business-cards/old-card.png','[]','[]','[]','card only, taken before names were mandatory','LC-20260922-OLD05');
d.exec('PRAGMA user_version = 2');d.close()" 2>/dev/null
LEGACY_SUM=$(sql "$DATA/leads.db" "SELECT group_concat(id||name||status||product_image_paths||product_models||message||reference, '~') FROM (SELECT * FROM leads ORDER BY id)" | shasum | awk '{print $1}')
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
has   "startup reports schema v3" "schema v3" "$(cat "$LOG")"
check "database is at v3" 3 "$(sql "$DATA/leads.db" 'PRAGMA user_version')"
check "all 5 old enquiries kept" 5 "$(lead_count)"
check "old columns and contact data untouched (checksum)" "$LEGACY_SUM" "$(sql "$DATA/leads.db" "SELECT group_concat(id||name||status||product_image_paths||product_models||message||reference, '~') FROM (SELECT * FROM leads ORDER BY id)" | shasum | awk '{print $1}')"
check "3 of the 4 had product data -> 3 product rows" 3 "$(product_count)"
check "photos + models became ONE product (SKU = models joined)" "RX-200, VLX-9|2" "$(sql "$DATA/leads.db" "SELECT sku||'|'||json_array_length(photo_paths) FROM lead_products WHERE lead_id LIKE '1111%'")"
check "photos kept their order" '["products/old-a.jpg","products/old-b.jpg"]' "$(sql "$DATA/leads.db" "SELECT photo_paths FROM lead_products WHERE lead_id LIKE '1111%'")"
check "models-only enquiry -> SKU-only product" "ZZ-1|[]" "$(sql "$DATA/leads.db" "SELECT sku||'|'||photo_paths FROM lead_products WHERE lead_id LIKE '2222%'")"
check "photo-only enquiry -> photo-only product" '|["products/old-c.jpg"]' "$(sql "$DATA/leads.db" "SELECT sku||'|'||photo_paths FROM lead_products WHERE lead_id LIKE '4444%'")"
check "enquiry without products gets none (nothing invented)" 0 "$(sql "$DATA/leads.db" "SELECT COUNT(*) FROM lead_products WHERE lead_id LIKE '3333%'")"
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
check "restarting does not duplicate the migrated products" 3 "$(product_count)"

echo
echo "== 2. Old enquiries display correctly in the admin =="
check "admin login" 200 "$(login)"
PAGE=$(page "$BASE/admin/leads/11111111-aaaa-bbbb-cccc-000000000001")
has   "detail shows the product with its SKU" "RX-200, VLX-9" "$PAGE"
has   "detail links both old photos" 'products/old-a.jpg.*products/old-b.jpg' "$PAGE"
has   "detail still shows the business card" "business-cards/old-card.png" "$PAGE"
check "old photo still served" 200 "$(authcode "$BASE/api/admin/uploads/products/old-a.jpg")"
has   "list shows product + photo counts for old data" "1 个产品" "$(page $BASE/admin)"
has   "detail of an enquiry with no products says so" "没有产品记录" "$(page "$BASE/admin/leads/33333333-aaaa-bbbb-cccc-000000000003")"
has   "list still shows all 5" "共 5 条" "$(page $BASE/admin)"

###############################################################################
ADMIN_LIST=$(page $BASE/admin)
has   "admin list has a combined 公司 (姓名) column header" "公司 \(姓名\).*需求 / 产品.*状态" "$ADMIN_LIST"
has   "admin list title is Company (Person) for a named enquiry" "环球工业 \(王明\)" "$ADMIN_LIST"
has   "historical enquiry with neither company nor name shows 未提供 (未提供) and points to its card" "未提供 \(未提供\).*（见名片）" "$ADMIN_LIST"
check "...the empty name was NOT replaced in the database (nothing inferred or invented)" "" "$(sql "$DATA/leads.db" "SELECT name FROM leads WHERE id LIKE '5555%'")"
D5=$(page "$BASE/admin/leads/55555555-aaaa-bbbb-cccc-000000000005")
has   "detail page of that enquiry says 未提供 for company and name" "公司.*未提供.*姓名.*未提供" "$D5"
has   "detail page title for a named enquiry is Company (Person)" "环球工业 \(王明\)" "$(page "$BASE/admin/leads/11111111-aaaa-bbbb-cccc-000000000001")"

echo
echo "== 3. Multi-product submission: association, optional fields, mixed photo/SKU =="
P='[{"sku":"RX-200","colour":"黑色","quantity":"500 pcs","packaging":"彩盒包装\n每箱20件","photoCount":2},{"sku":"VLX-9","photoCount":0},{"sku":"","colour":"red","quantity":"","packaging":"","photoCount":1}]'
R=$(post -F name=Multi -F company=Acme -F email=multi@example.com -F country=Australia \
      -F clientSubmissionId=mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm01 -F 'requestedInformation=["报价"]' \
      --form-string "products=$P" \
      -F "productPhotos_0=@$FX/label-a.jpg;type=image/jpeg" -F "productPhotos_0=@$FX/label-b.jpg;type=image/jpeg" \
      -F "productPhotos_2=@$FX/label-c.jpg;type=image/jpeg")
check "3-product submission accepted" 200 "$(echo "$R" | last)"
REF=$(echo "$R" | body | jget reference)
has   "...with a reference" '^LC-[0-9]{8}-' "$REF"
check "one enquiry row, three product rows" "1|3" "$(sql "$DATA/leads.db" "SELECT (SELECT COUNT(*) FROM leads WHERE reference='$REF')||'|'||(SELECT COUNT(*) FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$REF')")"
check "products kept their order (positions 0,1,2)" "RX-200,VLX-9," "$(sql "$DATA/leads.db" "SELECT group_concat(sku) FROM (SELECT p.sku FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$REF' ORDER BY p.position)")"
check "product 1: colour/quantity/packaging stored" "黑色|500 pcs|彩盒包装"$'\n'"每箱20件" "$(sql "$DATA/leads.db" "SELECT p.colour||'|'||p.quantity||'|'||p.packaging FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$REF' AND p.position=0")"
check "product 2 (SKU only) has no photos and empty optional fields" "[]||" "$(sql "$DATA/leads.db" "SELECT p.photo_paths||'|'||p.colour||'|'||p.quantity FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$REF' AND p.position=1")"
check "product 3 (photo only) kept its colour, no SKU" "red|" "$(sql "$DATA/leads.db" "SELECT p.colour||'|'||p.sku FROM lead_products p JOIN leads l ON l.id=p.lead_id WHERE l.reference='$REF' AND p.position=2")"
PH0=$(photos_of "$REF" 0); PH1=$(photos_of "$REF" 1); PH2=$(photos_of "$REF" 2)
check "product 1 has 2 photos, product 2 none, product 3 one" "2|0|1" "$(node -e "console.log(JSON.parse(process.argv[1]).length+'|'+JSON.parse(process.argv[2]).length+'|'+JSON.parse(process.argv[3]).length)" "$PH0" "$PH1" "$PH2")"
check "photo 1 of product 1 is exactly the file uploaded for it (label-a)" "$(sha "$FX/label-a.jpg")" "$(stored_sha "$(nth_photo "$PH0" 0)")"
check "photo 2 of product 1 is label-b" "$(sha "$FX/label-b.jpg")" "$(stored_sha "$(nth_photo "$PH0" 1)")"
check "product 3's photo is label-c, not another product's" "$(sha "$FX/label-c.jpg")" "$(stored_sha "$(nth_photo "$PH2" 0)")"
has   "photos stored as uuid + detected extension under products/" '^products/[0-9a-f-]{36}\.jpg$' "$(nth_photo "$PH0" 0)"
check "files on disk = 4 legacy + 3 new" 7 "$(files_in_uploads)"
DETAIL_ID=$(sql "$DATA/leads.db" "SELECT id FROM leads WHERE reference='$REF'")
D=$(page "$BASE/admin/leads/$DETAIL_ID")
has   "admin detail lists Product 1, 2 and 3 in order" '产品 1.*产品 2.*产品 3' "$D"
has   "admin detail: product 1 photos then SKU" "$(nth_photo "$PH0" 0).*$(nth_photo "$PH0" 1).*RX-200" "$D"
has   "admin detail: product 3's photo appears after product 2" "VLX-9.*$(nth_photo "$PH2" 0)" "$D"
has   "admin detail shows colour / quantity / packaging" "黑色.*500 pcs.*彩盒包装" "$D"
has   "admin list shows 3 products, 3 photos" "3 个产品 · 3 张照片" "$(page $BASE/admin)"
R=$(post -F name=Multi -F company=Acme -F email=multi@example.com -F country=Australia -F clientSubmissionId=mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm01 --form-string "products=$P" -F "productPhotos_0=@$FX/label-a.jpg;type=image/jpeg" -F "productPhotos_0=@$FX/label-b.jpg;type=image/jpeg" -F "productPhotos_2=@$FX/label-c.jpg;type=image/jpeg")
check "retry of the same submission is a duplicate (no second enquiry)" "1" "$(sql "$DATA/leads.db" "SELECT COUNT(*) FROM leads WHERE client_submission_id='mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm01'")"
check "...and no extra products or files" "6|7" "$(product_count)|$(files_in_uploads)"
R=$(post -F name=NoProducts -F company=C -F email=np@example.com -F country=CN --form-string 'products=[]')
check "an enquiry with zero products is still allowed" 200 "$(echo "$R" | last)"
R=$(post -F name=Png -F company=C -F email=png@example.com -F country=CN --form-string 'products=[{"sku":"","photoCount":1}]' -F "productPhotos_0=@$FX/label-d.png;type=image/png")
check "PNG photo accepted" 200 "$(echo "$R" | last)"

echo
echo "== 4. Per-product validation (server side) =="
ROWS=$(lead_count); PRODS=$(product_count); FILES=$(files_in_uploads)
rep() { head -c "$1" /dev/zero | tr '\0' a; }
V() { post -F name=V -F company=V -F email=v@example.com -F country=CN "$@"; }
check "an enquiry with products but no company -> 400" 400 "$(post -F name=V -F email=v@example.com -F country=CN --form-string 'products=[{"sku":"A","photoCount":0}]' | last)"
check "an enquiry with products but no name -> 400" 400 "$(post -F company=V -F email=v@example.com -F country=CN --form-string 'products=[{"sku":"A","photoCount":0}]' | last)"
check "...even with a business card and a valid product" 400 "$(post -F "businessCard=@$FX/label-d.png;type=image/png" --form-string 'products=[{"sku":"A","photoCount":0}]' | last)"
check "product with neither photo nor SKU -> 400" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":0},{"sku":"","colour":"red","photoCount":0}]' | last)"
has   "...names the offending product" 'products\[1\]' "$(V --form-string 'products=[{"sku":"A","photoCount":0},{"sku":"","colour":"red","photoCount":0}]' | body)"
check "whitespace-only SKU counts as empty -> 400" 400 "$(V --form-string 'products=[{"sku":"   ","photoCount":0}]' | last)"
check "photoCount that disagrees with the files received -> 400" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":2}]' -F "productPhotos_0=@$FX/label-a.jpg;type=image/jpeg" | last)"
check "a valid first product does not rescue an invalid second one (nothing saved)" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":1},{"sku":"","photoCount":0}]' -F "productPhotos_0=@$FX/label-a.jpg;type=image/jpeg" | last)"
check "4 photos on one product -> 400" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":4}]' -F "productPhotos_0=@$FX/label-a.jpg" -F "productPhotos_0=@$FX/label-a.jpg" -F "productPhotos_0=@$FX/label-a.jpg" -F "productPhotos_0=@$FX/label-a.jpg" | last)"
TEN=$(node -e "console.log(JSON.stringify(Array.from({length:21},(_,i)=>({sku:'S'+i,photoCount:0}))))")
check "21 products -> 400" 400 "$(V --form-string "products=$TEN" | last)"
TEN=$(node -e "console.log(JSON.stringify(Array.from({length:20},(_,i)=>({sku:'S'+i,photoCount:0}))))")
check "exactly 20 products -> 200" 200 "$(V --form-string "products=$TEN" | last)"
SEVEN=$(node -e "console.log(JSON.stringify(Array.from({length:7},(_,i)=>({sku:'S'+i,photoCount:3}))))")
ARGS=(); for i in 0 1 2 3 4 5 6; do for k in 1 2 3; do ARGS+=(-F "productPhotos_$i=@$FX/label-a.jpg;type=image/jpeg"); done; done
check "21 photos in total (7 x 3) -> 400" 400 "$(V --form-string "products=$SEVEN" "${ARGS[@]}" | last)"
# JSON built here (not inside the check's quotes), so the quoting cannot silently produce malformed JSON
pj() { printf '[{"sku":"A","%s":"%s","photoCount":0}]' "$1" "$(rep "$2")"; }
J=$(printf '[{"sku":"%s","photoCount":0}]' "$(rep 61)")
check "SKU of 61 chars -> 400" 400 "$(V --form-string "products=$J" | last)"
has   "...names products[0]" 'products\[0\]' "$(V --form-string "products=$J" | body)"
J=$(printf '[{"sku":"%s","photoCount":0}]' "$(rep 60)")
check "SKU of 60 chars -> 200" 200 "$(V --form-string "products=$J" | last)"
J=$(pj colour 61);    check "colour of 61 chars -> 400" 400 "$(V --form-string "products=$J" | last)"
J=$(pj colour 60);    check "colour of 60 chars -> 200" 200 "$(V --form-string "products=$J" | last)"
J=$(pj quantity 41);  check "quantity of 41 chars -> 400" 400 "$(V --form-string "products=$J" | last)"
J=$(pj quantity 40);  check "quantity of 40 chars -> 200" 200 "$(V --form-string "products=$J" | last)"
J=$(pj packaging 501); check "packaging of 501 chars -> 400" 400 "$(V --form-string "products=$J" | last)"
J=$(pj packaging 500); check "packaging of 500 chars -> 200" 200 "$(V --form-string "products=$J" | last)"
check "products that is not JSON -> 400" 400 "$(V --form-string 'products=not json' | last)"
check "products that is not an array -> 400" 400 "$(V --form-string 'products={"sku":"A"}' | last)"
check "a product entry that is not an object -> 400" 400 "$(V --form-string 'products=["RX-200"]' | last)"
check "non-string SKU -> 400" 400 "$(V --form-string 'products=[{"sku":123,"photoCount":0}]' | last)"
check "negative photoCount -> 400" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":-1}]' | last)"
check "a text file posing as a product photo -> 400" 400 "$(V --form-string 'products=[{"sku":"A","photoCount":1}]' -F "productPhotos_0=@/etc/hosts;type=image/jpeg" | last)"
check "photos for a product index that does not exist are ignored, not stored" 200 "$(V --form-string 'products=[{"sku":"A","photoCount":0}]' -F "productPhotos_5=@$FX/label-a.jpg;type=image/jpeg" | last)"
check "rejected submissions stored nothing: only the valid ones were added (rows/products/files)" "$((ROWS+6))|$((PRODS+25))|$FILES" "$(lead_count)|$(product_count)|$(files_in_uploads)"
R=$(V --form-string 'products=[{"sku":"A\u0007B\u0000C","colour":"x\u001fy","photoCount":0}]')
check "control characters are stripped from product text" "ABC|xy" "$(sql "$DATA/leads.db" "SELECT sku||'|'||colour FROM lead_products ORDER BY rowid DESC LIMIT 1")"

###############################################################################
echo
echo "== 5. Exports =="
# one enquiry with hostile text, to check formula handling in every format
HOSTILE='[{"sku":"=HYPERLINK(\"http://evil.example\",\"x\")","colour":"+cmd|calc","quantity":"@SUM(1)","packaging":"-2+3","photoCount":1}]'
R=$(post --form-string name='=1+1' --form-string company='@evil' -F email=ex@example.com -F country=CN --form-string "products=$HOSTILE" -F "productPhotos_0=@$FX/label-a.jpg;type=image/jpeg")
check "hostile enquiry stored" 200 "$(echo "$R" | last)"
R=$(post -F name=Webp -F company=W -F email=w@example.com -F country=CN --form-string 'products=[{"sku":"W-1","photoCount":1}]' -F "productPhotos_0=@$FX/label-a.jpg;filename=x.webp;type=image/webp")
login >/dev/null
TOTAL_LEADS=$(lead_count); TOTAL_PRODS=$(product_count)

for path in /api/admin/export /api/admin/export/xlsx /api/admin/export/pdf; do
  check "$path requires login" 401 "$(code "$BASE$path")"
done

CSV=$(auth "$BASE/api/admin/export")
check "CSV: one row per product (+1 for each enquiry without products) + header" "$(sql "$DATA/leads.db" "SELECT (SELECT COUNT(*) FROM lead_products)+(SELECT COUNT(*) FROM leads WHERE id NOT IN (SELECT lead_id FROM lead_products))+1")" "$(printf '%s\n' "$CSV" | node "$REPO/tests/helpers/count-csv-rows.cjs")"
has   "CSV: the historical enquiry without a name is exported as 未提供" "LC-20260922-OLD05,[^,]*,[^,]*,未提供,未提供," "$CSV"
has   "CSV header has the product columns" "产品序号,产品编号/SKU,颜色,数量,包装要求,产品照片" "$CSV"
has   "CSV keeps the enquiry reference on every product row of a multi-product enquiry" "$REF.*RX-200" "$(echo "$CSV" | tr -d '\r' | tr '\n' ' ')"
check "CSV: the 3-product enquiry appears on exactly 3 rows" 3 "$(printf '%s' "$CSV" | grep -c "$REF")"
has   "CSV: formula in SKU neutralised" "'=HYPERLINK" "$CSV"
has   "CSV: formula in colour neutralised" "'\+cmd" "$CSV"
has   "CSV: formula in quantity neutralised" "'@SUM" "$CSV"
has   "CSV: formula-like packaging neutralised" "'-2\+3" "$CSV"
hasnt "CSV: no raw formula cell" '(^|,)=HYPERLINK' "$CSV"
has   "CSV lists the stored photo file names" 'products/[0-9a-f-]{36}\.jpg \| products/[0-9a-f-]{36}\.jpg' "$CSV"

echo
echo "  -- Excel --"
HDR=$(auth -D - -o "$W/out.xlsx" "$BASE/api/admin/export/xlsx" | tr -d '\r' | tr 'A-Z' 'a-z')
has   "xlsx: content type" "content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" "$HDR"
has   "xlsx: download filename" 'content-disposition: attachment; filename="leads-[0-9-]+\.xlsx"' "$HDR"
has   "xlsx: not cacheable, nosniff" "cache-control: no-store" "$HDR"
check "xlsx: is a zip (PK)" "PK" "$(head -c 2 "$W/out.xlsx")"
check "xlsx: contains embedded media files" "yes" "$(unzip -l "$W/out.xlsx" | grep -q 'xl/media/image' && echo yes || echo no)"
node "$REPO/tests/helpers/inspect-xlsx.cjs" "$REPO" "$W/out.xlsx" > "$W/xlsx.json" 2>"$W/xlsx.err"
check "xlsx: opens and parses with a spreadsheet reader" "yes" "$([ -s "$W/xlsx.json" ] && echo yes || { cat "$W/xlsx.err"; echo no; })"
xq() { node -e "const j=JSON.parse(require('fs').readFileSync('$W/xlsx.json','utf8'));console.log(eval(process.argv[1]))" "$1"; }
check "xlsx: sheets are 产品, 咨询, 说明" "产品,咨询,说明" "$(xq "j.sheets.map(s=>s.name).join(',')")"
check "xlsx: the nameless historical enquiry shows 未提供 in the 姓名 column" "未提供" "$(xq "j.sheets.find(s=>s.name=='咨询').rows.find(r=>r[0]=='LC-20260922-OLD05')[3]")"
check "xlsx: ...and 未提供 in the 公司 column" "未提供" "$(xq "j.sheets.find(s=>s.name=='咨询').rows.find(r=>r[0]=='LC-20260922-OLD05')[4]")"
check "xlsx: a named enquiry keeps its name" "王明" "$(xq "j.sheets.find(s=>s.name=='咨询').rows.find(r=>r[0]=='LC-20260918-OLD01')[3]")"
check "xlsx: 咨询 sheet has one row per enquiry (+header)" "$((TOTAL_LEADS+1))" "$(xq "j.sheets.find(s=>s.name=='咨询').rows.length")"
check "xlsx: 产品 sheet has one row per product (+header)" "$((TOTAL_PRODS+1))" "$(xq "j.sheets.find(s=>s.name=='产品').rows.length")"
check "xlsx: the 3-product enquiry has 3 rows in 产品 sharing its reference" 3 "$(xq "j.sheets.find(s=>s.name=='产品').rows.filter(r=>r[0]=='$REF').length")"
check "xlsx: those rows carry SKU / colour / quantity / packaging" "RX-200|黑色|500 pcs" "$(xq "(r=>r[6]+'|'+r[7]+'|'+r[8])(j.sheets.find(s=>s.name=='产品').rows.find(r=>r[0]=='$REF'&&r[5]==1))")"
EXPECTED_IMAGES=$(sql "$DATA/leads.db" "SELECT COALESCE(SUM(json_array_length(photo_paths)),0) FROM lead_products")
check "xlsx: every stored product photo is embedded in the 产品 sheet ($EXPECTED_IMAGES)" "$EXPECTED_IMAGES" "$(xq "j.sheets.find(s=>s.name=='产品').images.length")"
check "xlsx: the two legacy business cards are embedded in 咨询" 2 "$(xq "j.sheets.find(s=>s.name=='咨询').images.length")"
# the embedded bytes must be exactly what was uploaded (so the pictures really open)
check "xlsx: embedded image bytes equal the uploaded fixtures" "yes" "$(node -e "
const j=JSON.parse(require('fs').readFileSync('$W/xlsx.json','utf8'));
const crypto=require('crypto'),fs=require('fs');
const fx=['label-a.jpg','label-b.jpg','label-c.jpg','label-d.png'].map(f=>crypto.createHash('sha1').update(fs.readFileSync('$FX/'+f)).digest('hex'));
const imgs=j.sheets.flatMap(s=>s.images);
console.log(imgs.length>0&&imgs.every(i=>fx.includes(i.sha1))?'yes':'no')")"
check "xlsx: each photo sits in the row of ITS product (label-a/b on product 1 row)" "yes" "$(node -e "
const j=JSON.parse(require('fs').readFileSync('$W/xlsx.json','utf8'));const crypto=require('crypto'),fs=require('fs');
const h=f=>crypto.createHash('sha1').update(fs.readFileSync('$FX/'+f)).digest('hex');
const ps=j.sheets.find(s=>s.name=='产品');
// row index (0-based, header is row 0) of the first product of the multi-product enquiry
const idx=ps.rows.findIndex(r=>r[0]=='$REF'&&r[5]==1);
const at=(row)=>ps.images.filter(i=>i.row==row).map(i=>i.sha1).sort().join();
const ok=at(idx)==[h('label-a.jpg'),h('label-b.jpg')].sort().join() && at(idx+1)=='' && at(idx+2)==h('label-c.jpg');
console.log(ok?'yes':'no')")"
check "xlsx: formulas from visitors are plain text, never formulas" "0" "$(unzip -p "$W/out.xlsx" 'xl/worksheets/*.xml' | grep -c '<f>')"
has   "xlsx: hostile SKU is present as text" "=HYPERLINK" "$(unzip -p "$W/out.xlsx" xl/sharedStrings.xml)"
has   "xlsx: the 说明 sheet states the scope" "全部咨询，共 $TOTAL_LEADS 条" "$(unzip -p "$W/out.xlsx" xl/sharedStrings.xml)"

echo
echo "  -- PDF --"
HDR=$(auth -D - -o "$W/out.pdf" "$BASE/api/admin/export/pdf" | tr -d '\r' | tr 'A-Z' 'a-z')
has   "pdf: content type" "content-type: application/pdf" "$HDR"
has   "pdf: download filename" 'content-disposition: attachment; filename="leads-[0-9-]+\.pdf"' "$HDR"
check "pdf: starts with %PDF and ends with %%EOF" "yes" "$([ "$(head -c 5 "$W/out.pdf")" == "%PDF-" ] && tail -c 16 "$W/out.pdf" | grep -q '%%EOF' && echo yes || echo no)"
PDFTXT=$(LC_ALL=C tr -c '[:print:]\n' '.' < "$W/out.pdf")
PAGES=$(printf '%s' "$PDFTXT" | grep -c '/Type /Page$')
check "pdf: has at least one page" "yes" "$([ "$PAGES" -ge 1 ] && echo yes || echo no)"
check "pdf: every stored photo + the 2 business cards is embedded as an image ($((EXPECTED_IMAGES+2)))" "$((EXPECTED_IMAGES+2))" "$(printf '%s' "$PDFTXT" | grep -c '/Subtype /Image')"
check "pdf: a Chinese font is embedded" "yes" "$(printf '%s' "$PDFTXT" | grep -q 'FontFile' && echo yes || echo no)"
check "pdf: reports photos embedded/skipped in headers" "yes" "$(echo "$HDR" | grep -q 'x-export-photos-embedded' && echo yes || echo no)"

echo
echo "  -- Export size budget and busy guard --"
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW" EXPORT_MAX_IMAGE_MB=0.03
login >/dev/null
HDR=$(auth -D - -o "$W/small.xlsx" "$BASE/api/admin/export/xlsx" | tr -d '\r' | tr 'A-Z' 'a-z')
check "tiny image budget: export still succeeds" "PK" "$(head -c 2 "$W/small.xlsx")"
check "...and reports skipped photos" "yes" "$(echo "$HDR" | grep 'x-export-photos-skipped' | grep -vq ': 0$' && echo yes || echo no)"
has   "...and the 说明 sheet says photos were not embedded" "张照片未嵌入" "$(unzip -p "$W/small.xlsx" xl/sharedStrings.xml)"
has   "...and the product cell names the omitted file" "未嵌入（超出导出体积上限）" "$(unzip -p "$W/small.xlsx" xl/sharedStrings.xml)"
HDR=$(auth -D - -o "$W/small.pdf" "$BASE/api/admin/export/pdf" | tr -d '\r' | tr 'A-Z' 'a-z')
check "tiny image budget: PDF still succeeds" "%PDF-" "$(head -c 5 "$W/small.pdf")"
start_server DATA_DIR="$DATA" ADMIN_PASSWORD="$PW"
login >/dev/null
for i in 1 2 3; do ( echo "$(authcode "$BASE/api/admin/export/xlsx")" >> "$W/par.txt" ) & done; wait
check "3 simultaneous Excel exports: every answer is 200 or 429, never an error" "0" "$(grep -vcE '^(200|429)$' "$W/par.txt")"
check "...and at least one succeeded" "yes" "$(grep -q '^200$' "$W/par.txt" && echo yes || echo no)"
rm -f "$W/par.txt"

echo
echo "== 6. Existing protections still hold =="
check "public submit still has rate limiting" "yes" "$(for i in $(seq 1 65); do curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/leads -H 'X-Forwarded-For: 203.0.113.99' -F name=x; done | grep -q '^429$' && echo yes || echo no)"
check "admin pages still need login" "307" "$(code $BASE/admin)"
check "uploads route still needs login" 401 "$(code "$BASE/api/admin/uploads/products/old-a.jpg")"
check "status update API still works" 200 "$(curl -s -b "$W/jar.txt" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/leads/$DETAIL_ID" -H 'Content-Type: application/json' -d '{"status":"已报价"}')"
check "...and the status is saved" "已报价" "$(sql "$DATA/leads.db" "SELECT status FROM leads WHERE id='$DETAIL_ID'")"

stop_server
echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
