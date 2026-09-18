#!/usr/bin/env bash
# Builds the handoff folder for a Windows exhibition PC:
#
#   dist/Langhao-Exhibition-App/
#   ├── app/                      (next build --output=standalone, minus unused sharp)
#   ├── node/node.exe             (portable Node runtime, downloaded + checksummed)
#   ├── Start Exhibition App.bat
#   └── 使用说明.txt
#
# Run this from the project root: ./scripts/package-windows.sh
# Requires internet access once, to download the Node runtime (cached after
# the first run in scripts/.cache/).
#
# The resulting folder needs NO npm install / Node install on the target PC —
# just copy it over and double-click the .bat file. See README.md.

set -euo pipefail
cd "$(dirname "$0")/.."

NODE_VERSION="${NODE_VERSION:-22.23.2}"
CACHE_DIR="scripts/.cache"
DIST_DIR="launcher/dist"
PKG_DIR="$DIST_DIR/Langhao-Exhibition-App"

mkdir -p "$CACHE_DIR"

echo "== 1/5  Building the app (next build, output: standalone) =="
rm -rf .next data
npm run build

echo "== 2/5  Fetching the portable Windows Node runtime (v$NODE_VERSION) =="
NODE_ZIP="node-v${NODE_VERSION}-win-x64.zip"
if [ ! -f "$CACHE_DIR/$NODE_ZIP" ]; then
  curl -sL -o "$CACHE_DIR/$NODE_ZIP" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}"
  curl -sL -o "$CACHE_DIR/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  EXPECTED=$(grep " ${NODE_ZIP}\$" "$CACHE_DIR/SHASUMS256.txt" | awk '{print $1}')
  ACTUAL=$(shasum -a 256 "$CACHE_DIR/$NODE_ZIP" | awk '{print $1}')
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum mismatch for $NODE_ZIP — aborting." >&2
    rm -f "$CACHE_DIR/$NODE_ZIP"
    exit 1
  fi
fi
rm -rf "$CACHE_DIR/node-v${NODE_VERSION}-win-x64"
unzip -q "$CACHE_DIR/$NODE_ZIP" -d "$CACHE_DIR"

echo "== 3/5  Assembling the app/ folder =="
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/app" "$PKG_DIR/node"
cp -R .next/standalone/. "$PKG_DIR/app/"
cp -R public "$PKG_DIR/app/public"
mkdir -p "$PKG_DIR/app/.next"
cp -R .next/static "$PKG_DIR/app/.next/static"
# Unused (no next/image anywhere) and platform-specific (built for THIS
# machine, not Windows) — strip it rather than ship a dead, wrong-arch binary.
rm -rf "$PKG_DIR/app/node_modules/@img" "$PKG_DIR/app/node_modules/sharp"
rm -rf "$PKG_DIR/app/data"

echo "== 4/5  Adding the portable Node runtime =="
cp "$CACHE_DIR/node-v${NODE_VERSION}-win-x64/node.exe" "$PKG_DIR/node/node.exe"
cp "$CACHE_DIR/node-v${NODE_VERSION}-win-x64/LICENSE" "$PKG_DIR/node/LICENSE"

echo "== 5/5  Copying launcher + instructions =="
cp "launcher/Start Exhibition App.bat" "$PKG_DIR/Start Exhibition App.bat"
cp "launcher/使用说明.txt" "$PKG_DIR/使用说明.txt"
find "$PKG_DIR" -name ".DS_Store" -delete

cd "$DIST_DIR"
rm -f Langhao-Exhibition-App.zip
zip -rq -X Langhao-Exhibition-App.zip "Langhao-Exhibition-App"

echo
echo "Done: $DIST_DIR/Langhao-Exhibition-App.zip"
echo "Copy this to each of the 3 exhibition PCs and unzip it there."
