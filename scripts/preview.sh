#!/usr/bin/env bash
# Local production-mode preview: the same standalone server that runs on EC2,
# on http://localhost:3000 (override with PORT=...).
#
#   npm run preview          # build, assemble into .preview/, start
#   SKIP_BUILD=1 npm run preview
#
# - Admin password comes from .env.local (git-ignored). If it has none, a random
#   one is generated into .env.local; it is never printed and never committed.
# - Leads and photos go to ./data (git-ignored). Delete ./data to start empty.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${PORT:-3000}"

if ! grep -qE '^ADMIN_PASSWORD=.{12,}' .env.local 2>/dev/null; then
  umask 077
  PASSWORD="$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  touch .env.local
  grep -v '^ADMIN_PASSWORD=' .env.local > .env.local.tmp || true
  printf 'ADMIN_PASSWORD=%s\n' "$PASSWORD" >> .env.local.tmp
  mv .env.local.tmp .env.local
  echo "Generated a preview admin password into .env.local (git-ignored)."
fi
ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' .env.local | tail -n1 | cut -d= -f2-)"

if [ "${SKIP_BUILD:-}" != "1" ]; then
  rm -rf .next
  npm run build
fi
[ -f .next/standalone/server.js ] || { echo "no build found — run without SKIP_BUILD" >&2; exit 1; }

rm -rf .preview && mkdir -p .preview/.next
cp -R .next/standalone/. .preview/
cp -R public .preview/public
cp -R .next/static .preview/.next/static
rm -rf .preview/data

echo
echo "Preview:  http://localhost:$PORT           (visitor form)"
echo "Admin:    http://localhost:$PORT/admin     (password: see ADMIN_PASSWORD in .env.local)"
echo "Data:     $ROOT/data   (git-ignored)"
echo "Stop:     Ctrl+C"
echo
cd .preview
exec env DATA_DIR="$ROOT/data" ADMIN_PASSWORD="$ADMIN_PASSWORD" PORT="$PORT" HOSTNAME=127.0.0.1 node server.js
