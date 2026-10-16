#!/usr/bin/env bash
# One-time (re-runnable) setup of a fresh Amazon Linux 2023 instance for the
# Langhao exhibition lead-capture site.
#
#   git clone https://github.com/sylsylshi33-dev/Langhao-Exibition-Sheet.git
#   cd Langhao-Exibition-Sheet
#   sudo ./deploy/bootstrap-ec2.sh --domain leads.example.com --email you@example.com
#
# What it does (all under this instance only — it never touches other servers):
#   - installs a pinned Node.js 22 (checksum-verified) into /opt
#   - creates the unprivileged 'langhao' and 'caddy' users
#   - creates /opt/langhao, /var/lib/langhao (data), /var/backups/langhao
#   - writes /etc/langhao/langhao.env with a generated admin password
#   - installs the app service, the daily backup timer, and Caddy (HTTPS)
#
# It does NOT deploy the app: run deploy.sh with a release tarball afterwards.
# Set DRY_RUN=1 to print what would happen without changing anything.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.23.2}"
DOMAIN=""
EMAIL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email)  EMAIL="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

DRY="${DRY_RUN:-}"
say()  { printf '\n==> %s\n' "$*"; }
run()  { if [ -n "$DRY" ]; then printf '   + %s\n' "$*"; else "$@"; fi; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "usage: sudo ./deploy/bootstrap-ec2.sh --domain leads.example.com [--email you@example.com]"
case "$DOMAIN" in
  *://*|*/*|*" "*) die "--domain must be a bare host name like leads.example.com (got '$DOMAIN')" ;;
  [0-9]*.[0-9]*.[0-9]*.[0-9]*) die "--domain must be a DNS name, not an IP address: HTTPS certificates are issued for names" ;;
esac
if [ -z "$DRY" ] && [ "$(id -u)" != "0" ]; then die "run with sudo"; fi

HERE="$(cd "$(dirname "$0")" && pwd)"
for f in langhao.service langhao-backup.service langhao-backup.timer caddy.service Caddyfile.template; do
  [ -f "$HERE/$f" ] || die "missing $HERE/$f — run this script from a full checkout of the repository"
done

if [ -r /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}-${VERSION_ID:-}" in
    amzn-2023*) ;;
    *) echo "WARNING: written for Amazon Linux 2023; this is ${PRETTY_NAME:-unknown}." >&2 ;;
  esac
fi

case "$(uname -m)" in
  x86_64)        NODE_ARCH="x64";   CADDY_ARCH="amd64" ;;
  aarch64|arm64) NODE_ARCH="arm64"; CADDY_ARCH="arm64" ;;
  *) die "unsupported CPU architecture: $(uname -m)" ;;
esac

sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
# Caddy publishes SHA-512 checksums (Node publishes SHA-256).
sha512_of() { if command -v sha512sum >/dev/null 2>&1; then sha512sum "$1" | awk '{print $1}'; else shasum -a 512 "$1" | awk '{print $1}'; fi; }

###############################################################################
say "1/8  Users and directories"
getent group langhao >/dev/null 2>&1 || run groupadd --system langhao
id langhao >/dev/null 2>&1 || run useradd --system --gid langhao --home-dir /var/lib/langhao --shell /sbin/nologin langhao
getent group caddy >/dev/null 2>&1 || run groupadd --system caddy
id caddy >/dev/null 2>&1 || run useradd --system --gid caddy --home-dir /var/lib/caddy --shell /sbin/nologin caddy

run install -d -o root    -g root    -m 0755 /opt/langhao /opt/langhao/releases /opt/langhao/bin
run install -d -o langhao -g langhao -m 0750 /var/lib/langhao /var/backups/langhao /opt/langhao/src
run install -d -o root    -g langhao -m 0750 /etc/langhao
run install -d -o caddy   -g caddy   -m 0750 /var/lib/caddy
run install -d -o root    -g root    -m 0755 /etc/caddy

###############################################################################
say "2/8  Node.js $NODE_VERSION (official build, checksum verified)"
NODE_TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.gz"
NODE_HOME="/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
if [ -x "$NODE_HOME/bin/node" ]; then
  echo "   already installed: $NODE_HOME"
elif [ -n "$DRY" ]; then
  echo "   + download https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}, verify against SHASUMS256.txt, extract to $NODE_HOME"
else
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/$NODE_TARBALL" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
  curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  EXPECTED="$(grep " ${NODE_TARBALL}\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  [ -n "$EXPECTED" ] || die "no checksum listed for $NODE_TARBALL"
  [ "$EXPECTED" = "$(sha256_of "$TMP/$NODE_TARBALL")" ] || die "Node.js download failed its checksum"
  tar -xzf "$TMP/$NODE_TARBALL" -C /opt
  rm -rf "$TMP"
fi
run ln -sfn "$NODE_HOME" /opt/node

###############################################################################
say "3/8  Service configuration (/etc/langhao/langhao.env)"
ENV_FILE=/etc/langhao/langhao.env
if [ -f "$ENV_FILE" ]; then
  echo "   $ENV_FILE already exists — leaving it (and its password) untouched"
elif [ -n "$DRY" ]; then
  echo "   + create $ENV_FILE with DATA_DIR and a generated 24-character ADMIN_PASSWORD (mode 0640 root:langhao)"
else
  PASSWORD=""
  while [ "${#PASSWORD}" -lt 24 ]; do
    PASSWORD="$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  done
  umask 027
  cat > "$ENV_FILE" <<ENV
# Managed by bootstrap-ec2.sh. See deploy/langhao.env.example for the options.
DATA_DIR=/var/lib/langhao
ADMIN_PASSWORD=$PASSWORD
ENV
  chown root:langhao "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  echo "   created. Read the generated admin password with:  sudo grep ADMIN_PASSWORD $ENV_FILE"
fi

###############################################################################
say "4/8  Deployment scripts and systemd units"
for f in lib.sh deploy.sh rollback.sh backup.sh restore.sh sqlite-backup.mjs update-from-git.sh; do
  run install -m 0755 "$HERE/$f" "/opt/langhao/bin/$f"
done
run install -m 0644 "$HERE/langhao.service"        /etc/systemd/system/langhao.service
run install -m 0644 "$HERE/langhao-backup.service" /etc/systemd/system/langhao-backup.service
run install -m 0644 "$HERE/langhao-backup.timer"   /etc/systemd/system/langhao-backup.timer
run install -m 0644 "$HERE/caddy.service"          /etc/systemd/system/caddy.service

# Cap journal size so logs can never fill the disk.
run install -d -m 0755 /etc/systemd/journald.conf.d
if [ -z "$DRY" ]; then
  printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=30day\n' > /etc/systemd/journald.conf.d/langhao.conf
fi

###############################################################################
say "5/8  Caddy (automatic HTTPS)"
CADDY_BIN=/usr/local/bin/caddy
if [ -x "$CADDY_BIN" ]; then
  echo "   already installed: $("$CADDY_BIN" version 2>/dev/null | head -n1)"
elif [ -n "$DRY" ]; then
  echo "   + download the latest Caddy release for linux/$CADDY_ARCH from github.com/caddyserver/caddy, verify its checksum, install to $CADDY_BIN"
else
  TMP="$(mktemp -d)"
  # /releases/latest redirects to .../releases/tag/vX.Y.Z (no API rate limits, no JSON to parse).
  TAG="$(curl -fsSIL -o /dev/null -w '%{url_effective}' https://github.com/caddyserver/caddy/releases/latest | sed 's|.*/||')"
  case "$TAG" in v[0-9]*) ;; *) die "could not determine the latest Caddy release (got '$TAG')" ;; esac
  VER="${TAG#v}"
  ASSET="caddy_${VER}_linux_${CADDY_ARCH}.tar.gz"
  BASE="https://github.com/caddyserver/caddy/releases/download/${TAG}"
  curl -fsSL -o "$TMP/$ASSET" "$BASE/$ASSET"
  curl -fsSL -o "$TMP/checksums.txt" "$BASE/caddy_${VER}_checksums.txt"
  EXPECTED="$(grep " ${ASSET}\$" "$TMP/checksums.txt" | awk '{print $1}')"
  [ -n "$EXPECTED" ] || die "no checksum listed for $ASSET"
  [ "$EXPECTED" = "$(sha512_of "$TMP/$ASSET")" ] || die "Caddy download failed its checksum"
  tar -xzf "$TMP/$ASSET" -C "$TMP" caddy
  install -m 0755 "$TMP/caddy" "$CADDY_BIN"
  rm -rf "$TMP"
  echo "   installed Caddy $VER"
fi

say "6/8  Caddyfile for $DOMAIN"
if [ -z "$DRY" ]; then
  if [ -n "$EMAIL" ]; then ACME="email $EMAIL"; else ACME=""; fi
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__ACME_EMAIL__|$ACME|" "$HERE/Caddyfile.template" > /etc/caddy/Caddyfile
  chmod 0644 /etc/caddy/Caddyfile
  "$CADDY_BIN" validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || die "generated Caddyfile failed validation"
else
  echo "   + render deploy/Caddyfile.template for $DOMAIN -> /etc/caddy/Caddyfile and validate it"
fi

###############################################################################
say "7/8  Enable services"
run systemctl daemon-reload
run systemctl restart systemd-journald
run systemctl enable langhao-backup.timer
run systemctl start langhao-backup.timer
run systemctl enable langhao.service
run systemctl enable caddy.service
run systemctl restart caddy.service

###############################################################################
say "8/8  Done"
cat <<NEXT

Server is prepared. The app itself is NOT deployed yet, so https://$DOMAIN
will not serve the site until you do the next step.

  1. Read your admin password:   sudo grep ADMIN_PASSWORD /etc/langhao/langhao.env
  2. Deploy a release:           sudo /opt/langhao/bin/deploy.sh /tmp/<release>.tar.gz
     (build one with scripts/build-release.sh, or run update-from-git.sh)
  3. Check it:                   curl -s https://$DOMAIN/api/healthz

The DNS A record for $DOMAIN must point at this instance's Elastic IP, and
ports 80 + 443 must be open, for Caddy to obtain the certificate.
NEXT
