# Local builds

These scripts run this fork's `local` branch on one Linux machine: upstream T3 Code plus local commits. They need Git, `flock` and the [Vite+ CLI](https://viteplus.dev/guide/). Builds live in `~/.local/share/t3code-local/`, outside the checkout.

## Set up a machine

```bash
git clone git@github.com:Questi0nM4rk/t3code.git ~/Projects/t3code
cd ~/Projects/t3code
git switch local
git remote add upstream https://github.com/pingdotgg/t3code.git
git remote set-url --push upstream DISABLED
scripts/local/update.sh
```

## Change something

1. Edit and commit on `local`.
2. `scripts/local/dev.sh`: the server and the web app with hot reload, on their own data in `~/.t3/dev`. Try the change in the browser at the URL it prints.
3. `scripts/local/update.sh`: tests and builds the committed branch, switches `~/.local/share/t3code-local/current` to it and points the launcher entry `T3 Code` at it. A failed build leaves the old one in use.
4. Start `T3 Code` from the launcher, or `scripts/local/desktop.sh`. Quit any other T3 Code first, because both use `~/.t3`.

## Take an upstream release

```bash
scripts/local/update.sh v0.1.12
```

It fetches the tag, merges it into `local` and builds. A merge conflict stops it: resolve it, commit, and run `scripts/local/update.sh` again.
