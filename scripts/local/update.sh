#!/usr/bin/env bash
set -euo pipefail

# Builds the committed `local` branch, after merging an upstream tag into it when one is given,
# and switches the desktop launcher to the new build. A failed build leaves the old one in use.
repo=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
state="${XDG_DATA_HOME:-$HOME/.local/share}/t3code-local"

usage() { printf 'Usage: %s [upstream-tag]\n' "${0##*/}"; }
if [[ ${1:-} == --help ]]; then
  usage
  exit 0
fi
if [[ $# -gt 1 || ${1:-} == -* ]] || { [[ $# -eq 1 ]] && ! git check-ref-format "refs/tags/$1"; }; then
  usage >&2
  exit 2
fi

for command in git vp flock; do
  if ! command -v "$command" >/dev/null; then
    printf 'Required command missing: %s\n' "$command" >&2
    exit 1
  fi
done

mkdir -p -- "$state/releases"
exec {update_lock}>"$state/releases/.update.lock"
if ! flock -n "$update_lock"; then
  printf 'Another T3 Code build is in progress.\n' >&2
  exit 1
fi

if [[ -n $(git -C "$repo" status --porcelain) ]]; then
  printf 'Commit or discard the changes in %s first; the build takes the committed branch.\n' "$repo" >&2
  exit 1
fi

# A tag brings the upstream release into the local branch; a conflict stops here for a person.
if [[ $# -eq 1 ]]; then
  git -C "$repo" fetch --no-tags upstream "refs/tags/$1:refs/tags/$1"
  if ! git -C "$repo" merge --no-edit "$1"; then
    printf 'Merging %s conflicts. Resolve it in %s, commit, then run %s again without a tag.\n' "$1" "$repo" "${0##*/}" >&2
    exit 1
  fi
fi
commit=$(git -C "$repo" rev-parse HEAD)

candidate=$(mktemp -d "$state/releases/build.XXXXXXXX")
target="releases/${candidate##*/}"
cleanup() {
  if [[ $(readlink "$state/current") != "$target" ]]; then
    rm -rf -- "$candidate"
    printf 'Update failed. The current build was left in place.\n' >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git clone --quiet --shared --no-checkout "$repo" "$candidate"
git -C "$candidate" checkout --quiet --detach "$commit"
cd -- "$candidate"

vp install --frozen-lockfile
vp test run \
  apps/server/src/mcp/toolkits/pullRequests/handlers.test.ts \
  packages/source-control-github/src/server/GitHubSourceControlProvider.test.ts \
  packages/source-control-github/src/server/GitHubCredentials.test.ts
vp run build:desktop
vp env exec -- node apps/server/dist/bin.mjs --version

ln -s -- "$target" "$candidate/.current-link"
mv -Tf -- "$candidate/.current-link" "$state/current"

# The launcher menu runs this build in place of the installed app.
entry="${XDG_DATA_HOME:-$HOME/.local/share}/applications/t3code.desktop"
mkdir -p -- "$(dirname -- "$entry")"
cat >"$entry" <<EOF
[Desktop Entry]
Name=T3 Code
Comment=T3 Code built from the local branch
Exec=$repo/scripts/local/desktop.sh %U
TryExec=$repo/scripts/local/desktop.sh
Terminal=false
Type=Application
Icon=t3code
StartupWMClass=com.t3tools.T3Code
Categories=Development;
MimeType=x-scheme-handler/t3code;
EOF

printf 'Built %s. Start it from the launcher or with %s/scripts/local/desktop.sh.\n' "$(git -C "$candidate" describe --tags --always)" "$repo"
