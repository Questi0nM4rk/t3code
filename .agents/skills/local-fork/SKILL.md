---
name: local-fork
description: Build, update and run this fork's `local` branch on its owner's Linux machine with scripts/local. Use for updating T3 Code, merging an upstream tag, rebuilding the desktop app, a local app that shows no chats or login, a missing window icon, and changes to scripts/local. Use test-t3-app to verify UI behaviour.
---

# Local fork

The `local` branch is upstream T3 Code plus the owner's commits. It runs as the
owner's only T3 Code: the desktop app comes from `scripts/local/update.sh`, not
from a package. [scripts/local/README.md](../../../scripts/local/README.md)
holds the steps (set up, change, update, take a release); read it first.

| Script                          | Does                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/local/update.sh [tag]` | merges an upstream tag when given, tests and builds the committed branch, switches `~/.local/share/t3code-local/current`, writes the launcher entry and icon, removes old builds |
| `scripts/local/desktop.sh`      | starts the desktop app of `current` on the real data in `~/.t3`                                                                                                                  |
| `scripts/local/dev.sh`          | server and web app with hot reload on separate data in `~/.t3/dev`                                                                                                               |

## Rules

- Commit before `update.sh`: it builds the committed branch and refuses a
  dirty tree.
- Put local-only additions in new files. An edit to an upstream file
  (`AGENTS.md`, `CLAUDE.md`, shared source) conflicts whenever a tag changes
  the same lines; a new file never does.
- `update.sh` proves the branch tests and builds; it never starts the app.
  Prove UI behaviour with test-t3-app. A run takes minutes and about 5 GB per
  build. It keeps the new build, the one it replaced, and any build a running
  app still uses.

## Traps already hit

- **No chats or login in the app.** Electron keys what it stores in the
  keyring by the app's name. The released app is named `t3code`, so
  `update.sh` writes `desktop-app/package.json` with that name. A build that
  starts under another name (`Electron`, `T3 Code (Beta)`) cannot read
  `~/.t3/userdata/connection-catalog.json` and logs
  `ElectronSafeStorageDecryptError`.
- **Packaging fails.** `scripts/build-desktop-artifact.ts` refuses native
  modules that need a glibc newer than the ceiling in
  `scripts/linux-glibc.ts` (2.39). This machine's glibc is newer, so the
  build runs unpackaged from the build folder instead.
- **No icon in the bar.** The bar finds a window's icon by its class,
  `com.t3tools.T3Code`. The unpackaged app writes its own desktop entry for
  `t3code://` links without an icon, so `update.sh` installs the icon under
  the class name in the user's hicolor theme. A running Quickshell bar caches
  a failed lookup: restart it, a reload is not enough.
- **`t3code://` links start bare Electron.** `desktop.sh` sets
  `T3CODE_DESKTOP_LAUNCHER_PATH` to itself, so the entry the app writes
  starts the script.
