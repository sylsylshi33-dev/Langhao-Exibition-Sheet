#!/usr/bin/env bash
# Builds the handoff folder for a Mac (Apple Silicon) — mainly for testing
# on a MacBook before/alongside the Windows exhibition PCs:
#
#   launcher/dist-mac/Langhao-Exhibition-App-Mac/
#   ├── app/                          (next build --output=standalone, minus unused sharp)
#   ├── node/bin/node                 (portable Node runtime, downloaded + checksummed)
#   ├── Start Exhibition App.command
#   └── 使用说明-Mac.txt
#
# Run from the project root: ./scripts/package-mac.sh
# Requires internet access once, to download the Node runtime (cached after
# the first run in scripts/.cache/).

set -euo pipefail
cd "$(dirname "$0")/.."

NODE_VERSION="${NODE_VERSION:-22.23.2}"
ARCH="${MAC_ARCH:-arm64}"   # set MAC_ARCH=x64 for an Intel Mac build
CACHE_DIR="scripts/.cache"
DIST_DIR="launcher/dist-mac"
PKG_DIR="$DIST_DIR/Langhao-Exhibition-App-Mac"

mkdir -p "$CACHE_DIR"

echo "== 1/5  Building the app (next build, output: standalone) =="
rm -rf .next data
npm run build

echo "== 2/5  Fetching the portable macOS Node runtime ($ARCH, v$NODE_VERSION) =="
NODE_TARBALL="node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz"
if [ ! -f "$CACHE_DIR/$NODE_TARBALL" ]; then
  curl -sL -o "$CACHE_DIR/$NODE_TARBALL" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
  curl -sL -o "$CACHE_DIR/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  EXPECTED=$(grep " ${NODE_TARBALL}\$" "$CACHE_DIR/SHASUMS256.txt" | awk '{print $1}')
  ACTUAL=$(shasum -a 256 "$CACHE_DIR/$NODE_TARBALL" | awk '{print $1}')
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum mismatch for $NODE_TARBALL — aborting." >&2
    rm -f "$CACHE_DIR/$NODE_TARBALL"
    exit 1
  fi
fi
rm -rf "$CACHE_DIR/node-v${NODE_VERSION}-darwin-${ARCH}"
tar -xzf "$CACHE_DIR/$NODE_TARBALL" -C "$CACHE_DIR"

echo "== 3/5  Assembling the app/ folder =="
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/app" "$PKG_DIR/node"
cp -R .next/standalone/. "$PKG_DIR/app/"
cp -R public "$PKG_DIR/app/public"
mkdir -p "$PKG_DIR/app/.next"
cp -R .next/static "$PKG_DIR/app/.next/static"
# Unused (no next/image anywhere) — strip the dead weight.
rm -rf "$PKG_DIR/app/node_modules/@img" "$PKG_DIR/app/node_modules/sharp"
rm -rf "$PKG_DIR/app/data"

echo "== 4/5  Adding the portable Node runtime =="
# Just the node binary itself — not npm/npx/corepack, which we never use
# and which would otherwise sit here as dangling symlinks (their targets
# live under lib/node_modules/npm, which we don't copy).
mkdir -p "$PKG_DIR/node/bin"
cp "$CACHE_DIR/node-v${NODE_VERSION}-darwin-${ARCH}/bin/node" "$PKG_DIR/node/bin/node"
cp "$CACHE_DIR/node-v${NODE_VERSION}-darwin-${ARCH}/LICENSE" "$PKG_DIR/node/LICENSE"

echo "== 5/5  Copying launcher + instructions =="
cp "launcher/Start Exhibition App.command" "$PKG_DIR/Start Exhibition App.command"
chmod +x "$PKG_DIR/Start Exhibition App.command"
cp "launcher/使用说明-Mac.txt" "$PKG_DIR/使用说明-Mac.txt"
find "$PKG_DIR" -name ".DS_Store" -delete

cd "$DIST_DIR"
rm -f Langhao-Exhibition-App-Mac.zip
zip -rq -X --symlinks Langhao-Exhibition-App-Mac.zip "Langhao-Exhibition-App-Mac"

echo
echo "Done: $DIST_DIR/Langhao-Exhibition-App-Mac.zip"
