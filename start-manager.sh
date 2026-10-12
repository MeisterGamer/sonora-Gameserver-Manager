#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ -f .runtime/node-current ]] || { echo 'Run sudo bash install.sh first.' >&2; exit 1; }
read -r NODE_DIRECTORY < .runtime/node-current
[[ $NODE_DIRECTORY =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64$ ]] || { echo 'Invalid local Node runtime selection.' >&2; exit 1; }
NODE_BINARY="$PWD/.runtime/$NODE_DIRECTORY/bin/node"
[[ -x $NODE_BINARY ]] || { echo 'Local Node runtime missing.' >&2; exit 1; }
export NODE_ENV=production
export APEXHOST_DATA_DIR="$PWD/data/servers"
export SONORA_BIND_HOST="${SONORA_BIND_HOST:-127.0.0.1}"
export PATH="$(dirname -- "$NODE_BINARY"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
exec "$NODE_BINARY" "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/server.ts"
