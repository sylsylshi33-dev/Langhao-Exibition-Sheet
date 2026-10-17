#!/usr/bin/env bash
# Builds a deployable release tarball for the Linux server:
#
#   dist/langhao-<UTC time>-<git sha>[-dirty].tar.gz  (+ .sha256)
#
# The tarball is the standalone Next.js server (server.js + only the
# dependencies it needs + static assets). It contains no visitor data, no
# secrets and no platform-specific binaries, so it can be built on a laptop
# and run on the EC2 instance.
#
#   ./scripts/build-release.sh              # build + package
#   SKIP_BUILD=1 ./scripts/build-release.sh # package an existing .next build
set -euo pipefail
cd "$(dirname "$0")/.."

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
DIRTY=""
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then DIRTY="-dirty"; fi
STAMP="$(date -u +%Y%m%d%H%M%S)"
NAME="langhao-$STAMP-$SHA$DIRTY"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "WARNING: building with Node $(node -v); production runs Node 22.x (see .nvmrc)." >&2
fi

if [ "${SKIP_BUILD:-}" != "1" ]; then
  rm -rf .next
  npm run build
fi
[ -f .next/standalone/server.js ] || { echo "ERROR: no .next/standalone build found" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"
# The PDF export reads its Chinese font from assets/fonts at runtime (next to server.js).
mkdir -p "$STAGE/assets"
cp -R assets/fonts "$STAGE/assets/fonts"
[ -s "$STAGE/assets/fonts/NotoSansSC-Regular-subset.otf" ] || { echo "ERROR: PDF font missing from the release" >&2; exit 1; }

# Never ship data, and strip the optional image-optimisation library (nothing
# here uses next/image; its binaries are built for the machine that ran the build).
rm -rf "$STAGE/data" "$STAGE/node_modules/sharp" "$STAGE/node_modules/@img"

if find "$STAGE" \( -name '*.node' -o -name '*.so' -o -name '*.so.*' -o -name '*.dylib' -o -name '*.dll' \) | grep -q .; then
  echo "ERROR: release contains platform-specific binaries:" >&2
  find "$STAGE" \( -name '*.node' -o -name '*.so' -o -name '*.so.*' -o -name '*.dylib' -o -name '*.dll' \) >&2
  exit 1
fi

cat > "$STAGE/RELEASE" <<INFO
name=$NAME
git=$SHA$DIRTY
built_utc=$STAMP
built_with_node=$(node -v)
INFO

mkdir -p dist
tar -czf "dist/$NAME.tar.gz" -C "$STAGE" .
if command -v sha256sum >/dev/null 2>&1; then
  (cd dist && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
else
  (cd dist && shasum -a 256 "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
fi

echo
echo "Release: dist/$NAME.tar.gz  ($(du -h "dist/$NAME.tar.gz" | cut -f1))"
echo "Next:    scp dist/$NAME.tar.gz* <server>:/tmp/  &&  sudo /opt/langhao/bin/deploy.sh /tmp/$NAME.tar.gz"
