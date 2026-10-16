#!/bin/bash
# Double-click this file in Finder to start the exhibition app (offline mode).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/app"

# Admin password: generated once on first start and kept in admin-password.txt
# next to this file. To change it, edit that file (12+ characters) and restart.
PASSWORD_FILE="$HERE/admin-password.txt"
if [ ! -s "$PASSWORD_FILE" ]; then
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 > "$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
fi
export ADMIN_PASSWORD="$(cat "$PASSWORD_FILE")"

# Keep data where earlier versions of this package kept it (app/data).
export DATA_DIR="$HERE/app/data"

export PORT=4000
export HOSTNAME=127.0.0.1

echo "Starting the exhibition app..."
echo "Staff password is in: $PASSWORD_FILE"
echo "Do not close this window — closing it stops the app."
echo

"$HERE/node/bin/node" server.js &
SERVER_PID=$!

sleep 2
open "http://127.0.0.1:$PORT"

wait "$SERVER_PID"
