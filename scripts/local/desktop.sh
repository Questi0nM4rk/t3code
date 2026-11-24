#!/usr/bin/env bash
set -euo pipefail

# Starts the desktop app of the current local build, on the usual data in ~/.t3.
state="${XDG_DATA_HOME:-$HOME/.local/share}/t3code-local"
# A launcher menu starts this without a login shell's PATH.
PATH="$HOME/.local/share/vite-plus/bin:$HOME/.local/share/mise/shims:$PATH"
if [[ ! -f "$state/current/apps/desktop/dist-electron/main.cjs" ]]; then
  printf 'No local T3 Code build. Run scripts/local/update.sh first.\n' >&2
  exit 1
fi
cd -P -- "$state/current"
exec vp run start:desktop "$@"
