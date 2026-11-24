#!/usr/bin/env bash
set -euo pipefail

# Runs this checkout with hot reload: the server and the web app restart or reload on every save,
# on their own data in ~/.t3/dev, beside the desktop app.
repo=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd -- "$repo"
if [[ ! -d node_modules ]]; then
  vp install --frozen-lockfile
fi
exec vp run dev "$@"
