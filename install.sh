#!/usr/bin/env bash
# Ubuntu/Debian deployment: shared runtime, immutable release, preserved data.
set -Eeuo pipefail
umask 022
START=false
for argument in "$@"; do
  case "$argument" in
    --start) START=true ;;
    *) echo 'Usage: sudo bash install.sh [--start]' >&2; exit 2 ;;
  esac
done
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash install.sh.' >&2; exit 1; }
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || {
  echo 'Supported: Debian/Ubuntu Linux x86_64.' >&2; exit 1;
}
command -v apt-get >/dev/null
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
git -C "$SOURCE_DIR" rev-parse --show-toplevel >/dev/null
[[ -z $(git -C "$SOURCE_DIR" status --porcelain --untracked-files=no) ]] || {
  echo 'Commit/save tracked changes first; deployment uses git HEAD.' >&2; exit 1;
}
REVISION=$(git -C "$SOURCE_DIR" rev-parse HEAD)
RELEASE_DIR="/opt/sonora-releases/$(date -u +%Y%m%dT%H%M%SZ)-${REVISION:0:12}-$$"
DATA_ROOT=/opt/sonora-manager/data
RUNTIME_ROOT=/opt/sonora-runtime
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y ca-certificates curl git tar xz-utils jq build-essential libatomic1 libpulse0
dpkg --add-architecture i386
apt-get update -q
apt-get install -y lib32gcc-s1 lib32stdc++6
WORK_DIR=$(mktemp -d)
trap 'rm -rf -- "$WORK_DIR"' EXIT
trap 'echo "Installation failed at line $LINENO; check the service before restarting." >&2' ERR

# Official Node distribution with verified SHA-256, independent of root's nvm.
curl -fsSL --max-time 60 https://nodejs.org/dist/index.json -o "$WORK_DIR/node-index.json"
NODE_VERSION=$(jq -er '[.[] | select(.version | test("^v24\\."))][0].version' "$WORK_DIR/node-index.json")
[[ $NODE_VERSION =~ ^v24\.[0-9]+\.[0-9]+$ ]]
NODE_ARCHIVE="node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSL --max-time 300 "https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}" -o "$WORK_DIR/$NODE_ARCHIVE"
curl -fsSL --max-time 60 "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" -o "$WORK_DIR/node-sums.txt"
awk -v file="$NODE_ARCHIVE" '$2 == file {print}' "$WORK_DIR/node-sums.txt" > "$WORK_DIR/node-check.txt"
[[ -s $WORK_DIR/node-check.txt ]]
(cd "$WORK_DIR" && sha256sum --check node-check.txt)
mkdir -p "$RUNTIME_ROOT"
NODE_ROOT="$RUNTIME_ROOT/node-${NODE_VERSION}-linux-x64-$$"
mkdir "$NODE_ROOT"
tar -xJf "$WORK_DIR/$NODE_ARCHIVE" --strip-components=1 -C "$NODE_ROOT"
export PATH="$NODE_ROOT/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
NODE_BINARY="$NODE_ROOT/bin/node"
"$NODE_BINARY" --version

if ! command -v java >/dev/null || ! java -version 2>&1 | grep -Eq 'version "(25|2[6-9]|[3-9][0-9])'; then
  if apt-cache show openjdk-25-jre-headless >/dev/null 2>&1; then
    apt-get install -y openjdk-25-jre-headless
  else
    curl -fsSL --max-time 60 'https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jre&os=linux&vendor=eclipse' -o "$WORK_DIR/java.json"
    JAVA_URL=$(jq -er '.[0].binary.package.link' "$WORK_DIR/java.json")
    JAVA_HASH=$(jq -er '.[0].binary.package.checksum' "$WORK_DIR/java.json")
    [[ $JAVA_URL == https://github.com/adoptium/temurin25-binaries/releases/download/* && $JAVA_HASH =~ ^[a-f0-9]{64}$ ]]
    curl -fsSL --max-time 300 "$JAVA_URL" -o "$WORK_DIR/java.tar.gz"
    printf '%s  java.tar.gz\n' "$JAVA_HASH" > "$WORK_DIR/java-check.txt"
    (cd "$WORK_DIR" && sha256sum --check java-check.txt)
    JAVA_ROOT="$RUNTIME_ROOT/temurin25-$JAVA_HASH"
    mkdir -p "$JAVA_ROOT"
    tar -xzf "$WORK_DIR/java.tar.gz" --strip-components=1 -C "$JAVA_ROOT"
    export JAVA_HOME="$JAVA_ROOT"
    export PATH="$JAVA_ROOT/bin:$PATH"
    java -version
  fi
fi
id sonora >/dev/null 2>&1 || useradd --system --user-group --create-home --home-dir /var/lib/sonora --shell /usr/sbin/nologin sonora
mkdir -p "$RELEASE_DIR" "$DATA_ROOT/servers" "$DATA_ROOT/steamcmd"
git -C "$SOURCE_DIR" archive HEAD | tar -xf - -C "$RELEASE_DIR"
cd "$RELEASE_DIR"
npm exec --yes --package=pnpm@11.25.0 -- pnpm install --frozen-lockfile --ignore-scripts
npm exec --yes --package=pnpm@11.25.0 -- pnpm run lint
npm exec --yes --package=pnpm@11.25.0 -- pnpm run build
printf '%s\n' "$REVISION" > DEPLOYED-REVISION

OLD_DIR=$(systemctl show sonora-manager -p WorkingDirectory --value 2>/dev/null || true)
for CONFIG_SOURCE in "$OLD_DIR/.env" /opt/sonora-manager/.env "$SOURCE_DIR/.env"; do
  if [[ -f $CONFIG_SOURCE ]]; then
    install -o root -g sonora -m 640 "$CONFIG_SOURCE" "$RELEASE_DIR/.env"
    break
  fi
done
chown -R sonora:sonora "$DATA_ROOT"
chmod 700 "$DATA_ROOT"
runuser -u sonora -- "$NODE_BINARY" --version
runuser -u sonora -- env "PATH=$PATH" "APEXHOST_DATA_DIR=$DATA_ROOT/servers" "$NODE_BINARY" "$RELEASE_DIR/scripts/check-runtime.mjs"

UNIT=/etc/systemd/system/sonora-manager.service
BACKUP_DIR="/var/backups/sonora/$(basename "$RELEASE_DIR")"
mkdir -p "$BACKUP_DIR"
[[ ! -f $UNIT ]] || cp -a "$UNIT" "$BACKUP_DIR/"
if [[ -d $UNIT.d ]]; then cp -a "$UNIT.d" "$BACKUP_DIR/"; fi
mkdir -p "$UNIT.d"
# Supersede the earlier repair override; preserve other administrator overrides.
cat > "$UNIT.d/paths.conf" <<EOF
[Service]
WorkingDirectory=$RELEASE_DIR
ExecStart=
ExecStart=$NODE_BINARY $RELEASE_DIR/node_modules/tsx/dist/cli.mjs $RELEASE_DIR/server.ts
Environment="PATH=$PATH"
Environment=APEXHOST_DATA_DIR=$DATA_ROOT/servers
EOF
cat > "$UNIT" <<EOF
[Unit]
Description=Sonora Gameserver Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sonora
Group=sonora
NoNewPrivileges=true
WorkingDirectory=$RELEASE_DIR
ExecStart=$NODE_BINARY $RELEASE_DIR/node_modules/tsx/dist/cli.mjs $RELEASE_DIR/server.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=SONORA_BIND_HOST=127.0.0.1
Environment=APEXHOST_DATA_DIR=$DATA_ROOT/servers
Environment="PATH=$PATH"
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify "$UNIT"
systemctl stop sonora-manager
systemctl daemon-reload
systemctl reset-failed sonora-manager
EXPECTED_DIR=$(systemctl show sonora-manager -p WorkingDirectory --value)
[[ $EXPECTED_DIR == "$RELEASE_DIR" ]] || {
  echo "Another override selects $EXPECTED_DIR; resolve it before starting." >&2; exit 1;
}
EFFECTIVE_EXEC=$(systemctl show sonora-manager -p ExecStart --value)
[[ $EFFECTIVE_EXEC == *"$NODE_BINARY"* && $EFFECTIVE_EXEC == *"$RELEASE_DIR/server.ts"* ]] || {
  echo 'Another override changed ExecStart; resolve it before starting.' >&2; exit 1;
}
if $START; then
  systemctl enable sonora-manager
  systemctl start sonora-manager
  HEALTHY=false
  for attempt in {1..30}; do
    if systemctl is-active --quiet sonora-manager && \
       curl -fsS --max-time 2 http://127.0.0.1:3000/api/health | jq -e '.success == true and .version == "0.1.1" and .update == "03"' >/dev/null; then
      HEALTHY=true; break
    fi
    sleep 1
  done
  $HEALTHY || { journalctl -u sonora-manager -n 50 --no-pager; exit 1; }
else
  echo 'Deployment complete. Manager remains stopped. Start with systemctl start sonora-manager.'
fi
echo "Deployed revision: $REVISION"
echo "Service source: $RELEASE_DIR"
echo "Persistent data: $DATA_ROOT"
echo 'Panel: http://127.0.0.1:3000; remote access through SSH tunnel or configured HTTPS proxy.'
