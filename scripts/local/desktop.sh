#!/usr/bin/env bash
set -euo pipefail

# Starts the desktop app of the current local build, on the usual data in ~/.t3.
state="${XDG_DATA_HOME:-$HOME/.local/share}/t3code-local"
if [[ ! -f "$state/current/desktop-app/package.json" ]]; then
  printf 'No local T3 Code build. Run scripts/local/update.sh first.\n' >&2
  exit 1
fi
app=$(readlink -f -- "$state/current")
electron="$app/apps/desktop/node_modules/electron/dist/electron"
# Like the upstream launcher: Chromium's sandbox needs a root-owned setuid helper.
sandbox=()
if [[ $(stat -c '%u %a' -- "${electron%/*}/chrome-sandbox") != "0 4755" ]]; then
  sandbox=(--no-sandbox)
fi
unset ELECTRON_RUN_AS_NODE
exec "$electron" "${sandbox[@]}" "$app/desktop-app" "$@"
