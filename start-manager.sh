#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Find node binary: check local runtime first, then system node
NODE_BINARY=""
if [[ -f .runtime/node-current ]]; then
  read -r NODE_DIRECTORY < .runtime/node-current
  if [[ -x "$PWD/.runtime/$NODE_DIRECTORY/bin/node" ]]; then
    NODE_BINARY="$PWD/.runtime/$NODE_DIRECTORY/bin/node"
  fi
fi

if [[ -z "$NODE_BINARY" ]]; then
  if command -v node &>/dev/null; then
    NODE_BINARY="$(which node)"
  else
    echo "Fehler: Kein Node.js gefunden. Bitte führe 'sudo bash install.sh' aus." >&2
    exit 1
  fi
fi

export NODE_ENV=production
export APEXHOST_DATA_DIR="$PWD/data/servers"
export PORT="${PORT:-3000}"
export PATH="$(dirname -- "$NODE_BINARY"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [[ -f "$PWD/node_modules/tsx/dist/cli.mjs" ]]; then
  exec "$NODE_BINARY" "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/server.ts"
else
  exec "$NODE_BINARY" "$(which npx 2>/dev/null || echo npx)" tsx server.ts
fi
