#!/bin/bash
# Double-click this file in Finder to start the exhibition app.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/app"

# Change this password before the show, then save the file.
export ADMIN_PASSWORD=langhao2026

export PORT=4000
export HOSTNAME=127.0.0.1

echo "Starting the exhibition app..."
echo "Do not close this window — closing it stops the app."
echo

"$HERE/node/bin/node" server.js &
SERVER_PID=$!

sleep 2
open "http://127.0.0.1:$PORT"

wait "$SERVER_PID"
