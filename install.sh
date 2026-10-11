#!/usr/bin/env bash
# In-place Debian/Ubuntu installation. Application, data and runtimes stay here.
set -Eeuo pipefail
umask 022
START=false
for argument in "$@"; do
  case "$argument" in --start) START=true ;; *) echo 'Usage: sudo bash install.sh [--start]' >&2; exit 2 ;; esac
done
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash install.sh.' >&2; exit 1; }
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Supported: Ubuntu/Debian Linux x64.' >&2; exit 1; }
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $SOURCE_DIR != *$'\n'* && $SOURCE_DIR != *'%'* && $SOURCE_DIR != *'"'* && $SOURCE_DIR != *'\\'* ]] || { echo 'Unsupported installation path.' >&2; exit 1; }
cd "$SOURCE_DIR"
DATA_ROOT="$SOURCE_DIR/data"
RUNTIME_ROOT="$SOURCE_DIR/.runtime"
BACKUP_DIR="$SOURCE_DIR/backups/install-$(date -u +%Y%m%dT%H%M%SZ)-$$"
INSTALL_USER=$(stat -c %U "$SOURCE_DIR")
INSTALL_GROUP=$(id -gn "$INSTALL_USER")
mkdir -p "$RUNTIME_ROOT" "$BACKUP_DIR"
WORK_DIR=$(mktemp -d "$RUNTIME_ROOT/.install-XXXXXX")
trap 'rm -rf -- "$WORK_DIR"' EXIT
trap 'echo "Installation failed at line $LINENO; no automatic start." >&2' ERR
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y ca-certificates curl git tar xz-utils jq build-essential libatomic1 libpulse0
dpkg --add-architecture i386
apt-get update -q
apt-get install -y lib32gcc-s1 lib32stdc++6
# Node is installed into this project, independent of nvm and /opt.
curl -fsSL --max-time 60 https://nodejs.org/dist/index.json -o "$WORK_DIR/node-index.json"
NODE_VERSION=$(jq -er '[.[] | select(.version | test("^v24\\."))][0].version' "$WORK_DIR/node-index.json")
[[ $NODE_VERSION =~ ^v24\.[0-9]+\.[0-9]+$ ]]
NODE_ARCHIVE="node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSL --max-time 300 "https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}" -o "$WORK_DIR/$NODE_ARCHIVE"
curl -fsSL --max-time 60 "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" -o "$WORK_DIR/node-sums.txt"
awk -v file="$NODE_ARCHIVE" '$2 == file {print}' "$WORK_DIR/node-sums.txt" > "$WORK_DIR/node-check.txt"
[[ -s $WORK_DIR/node-check.txt ]]
(cd "$WORK_DIR" && sha256sum --check node-check.txt)
NODE_ROOT="$RUNTIME_ROOT/node-${NODE_VERSION}-linux-x64"
if [[ ! -x $NODE_ROOT/bin/node ]]; then
  mkdir "$WORK_DIR/node"
  tar -xJf "$WORK_DIR/$NODE_ARCHIVE" --strip-components=1 -C "$WORK_DIR/node"
  [[ ! -e $NODE_ROOT ]] || { echo 'Incomplete Node directory exists; inspect it first.' >&2; exit 1; }
  mv "$WORK_DIR/node" "$NODE_ROOT"
fi
export PATH="$NODE_ROOT/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
NODE_BINARY="$NODE_ROOT/bin/node"
"$NODE_BINARY" --version
npm_config_cache="$RUNTIME_ROOT/npm-cache" npm exec --yes --package=pnpm@11.25.0 -- pnpm install --frozen-lockfile --ignore-scripts --store-dir "$RUNTIME_ROOT/pnpm-store"
npm_config_cache="$RUNTIME_ROOT/npm-cache" npm exec --yes --package=pnpm@11.25.0 -- pnpm run lint
npm_config_cache="$RUNTIME_ROOT/npm-cache" npm exec --yes --package=pnpm@11.25.0 -- pnpm run build
UNIT=/etc/systemd/system/sonora-manager.service
OLD_DIR=$(systemctl show sonora-manager -p WorkingDirectory --value 2>/dev/null || true)
OLD_DATA=$(systemctl show sonora-manager -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^APEXHOST_DATA_DIR=//p' || true)
[[ ! -f $UNIT ]] || cp -a "$UNIT" "$BACKUP_DIR/"
[[ ! -d $UNIT.d ]] || cp -a "$UNIT.d" "$BACKUP_DIR/"
systemctl stop sonora-manager 2>/dev/null || { [[ ! -f $UNIT ]] || exit 1; }
# Copy previous data only when there is no local dataset. Never overwrite or delete it.
PREVIOUS_DATA_PATHS=()
[[ -z $OLD_DATA ]] || PREVIOUS_DATA_PATHS+=("${OLD_DATA%/servers}")
[[ -z $OLD_DIR ]] || PREVIOUS_DATA_PATHS+=("$OLD_DIR/data")
PREVIOUS_DATA_PATHS+=(/opt/sonora-manager/data)
for PREVIOUS_DATA in "${PREVIOUS_DATA_PATHS[@]}"; do
  if [[ -n $PREVIOUS_DATA && $PREVIOUS_DATA != "$DATA_ROOT" && -d $PREVIOUS_DATA ]]; then
    if [[ -d $DATA_ROOT ]] && find "$DATA_ROOT" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
      printf 'Local data retained. Previous data remains at: %s\n' "$PREVIOUS_DATA"
    else
      mkdir -p "$DATA_ROOT"
      cp -a "$PREVIOUS_DATA/." "$DATA_ROOT/"
      printf 'Copied previous data from %s; original retained.\n' "$PREVIOUS_DATA"
    fi
    break
  fi
done
if [[ ! -f $SOURCE_DIR/.env ]]; then
  for PREVIOUS_ENV in "$OLD_DIR/.env" /opt/sonora-manager/.env; do
    if [[ -f $PREVIOUS_ENV ]]; then cp -a "$PREVIOUS_ENV" "$SOURCE_DIR/.env"; break; fi
  done
fi
mkdir -p "$DATA_ROOT/servers" "$DATA_ROOT/steamcmd"
# Full JDK 25, not just a JRE. Other majors are installed on demand in the panel.
"$NODE_BINARY" --input-type=module -e 'import {ensureJdk} from "./backend/java.ts"; await ensureJdk(process.cwd()+"/.runtime/jdks",25);'
chown -R "$INSTALL_USER:$INSTALL_GROUP" "$DATA_ROOT" "$RUNTIME_ROOT" "$SOURCE_DIR/node_modules" "$SOURCE_DIR/dist"
if [[ -f $SOURCE_DIR/.env ]]; then chown "$INSTALL_USER:$INSTALL_GROUP" "$SOURCE_DIR/.env"; chmod 600 "$SOURCE_DIR/.env"; fi
runuser -u "$INSTALL_USER" -- env "PATH=$PATH" "APEXHOST_DATA_DIR=$DATA_ROOT/servers" "$NODE_BINARY" "$SOURCE_DIR/scripts/check-runtime.mjs"
printf '%s\n' "$(basename "$NODE_ROOT")" > "$RUNTIME_ROOT/node-current"
chmod 755 "$SOURCE_DIR/start-manager.sh"
cat > "$SOURCE_DIR/sonora-manager.service" <<EOF
[Unit]
Description=Sonora Gameserver Manager
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_GROUP
NoNewPrivileges=true
WorkingDirectory=$SOURCE_DIR
ExecStart="$SOURCE_DIR/start-manager.sh"
Restart=on-failure
RestartSec=5
Environment=PORT=3000
TimeoutStopSec=30
[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify "$SOURCE_DIR/sonora-manager.service"
# Service registration is the sole application configuration outside this directory.
install -m 644 "$SOURCE_DIR/sonora-manager.service" "$UNIT"
# Retain all old overrides in the local backup; remove their active copies.
if [[ -d $UNIT.d ]]; then
  mv "$UNIT.d" "$BACKUP_DIR/disabled-overrides"
fi
systemctl daemon-reload
systemctl reset-failed sonora-manager
[[ $(systemctl show sonora-manager -p WorkingDirectory --value) == "$SOURCE_DIR" ]]
if $START; then
  systemctl start sonora-manager
else
  echo 'Installation complete. Manager remains stopped.'
fi
printf 'Program: %s\nData: %s\nJDKs: %s\nBackup: %s\n' "$SOURCE_DIR" "$DATA_ROOT" "$RUNTIME_ROOT/jdks" "$BACKUP_DIR"
echo 'Start explicitly with: sudo systemctl start sonora-manager (or ./start-manager.sh).'
