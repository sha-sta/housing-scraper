#!/bin/sh
# Installs or updates the housing watcher on a Mac with one pasted line:
#
#   curl -fsSL https://raw.githubusercontent.com/sha-sta/housing-scraper/main/scripts/install.sh | sh
#
# It needs no admin password. On a fresh Mac it first asks macOS to install Apple's developer
# tools, which the database driver needs. It downloads its own copy of Node into
# ~/.housing-scraper, puts the app in ~/housing-scraper, starts it as a background service,
# and opens the setup page. Your listings and settings live in ~/housing-scraper/data and
# survive an update.
set -eu

NODE_VERSION="v24.21.0"
APP_DIR="${HOUSING_DIR:-$HOME/housing-scraper}"
RUNTIME_DIR="${HOUSING_RUNTIME_DIR:-$HOME/.housing-scraper}"
TARBALL_URL="${HOUSING_TARBALL_URL:-https://github.com/sha-sta/housing-scraper/archive/refs/heads/main.tar.gz}"
PORT="${PORT:-4747}"

say() { printf '\n==> %s\n' "$1"; }
# Downloads to a file first. In "curl | tar" a failed download goes unnoticed, because the
# shell only looks at the exit status of tar.
fetch_and_unpack() {
  archive="$(mktemp)"
  curl -fsSL "$1" -o "$archive" || { rm -f "$archive"; fail "could not download $1"; }
  shift
  tar -xzf "$archive" "$@" || { rm -f "$archive"; fail "could not unpack the download"; }
  rm -f "$archive"
}
fail() { printf '\nInstall stopped: %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this installer supports macOS. On Linux, follow the Docker steps in the README."

case "$(uname -m)" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) fail "unsupported processor $(uname -m)" ;;
esac

# The database driver compiles during install, which needs Apple's Command Line Tools.
# A fresh Mac does not have them. macOS installs them through its own window.
if ! xcode-select -p >/dev/null 2>&1; then
  say "Your Mac needs Apple's developer tools first"
  xcode-select --install >/dev/null 2>&1 || true
  printf 'A window just opened. Click Install, then Agree. The download takes about 10 minutes.\n'
  printf 'Leave this window open. The install continues by itself when the tools are ready.\n'
  waited=0
  until xcode-select -p >/dev/null 2>&1; do
    sleep 10
    waited=$((waited + 10))
    [ "$waited" -lt 2400 ] || fail "the developer tools did not finish installing. Finish that install, then paste the line again."
  done
fi

NODE_HOME="$RUNTIME_DIR/node-$NODE_VERSION-darwin-$NODE_ARCH"
if [ ! -x "$NODE_HOME/bin/node" ]; then
  say "Downloading Node $NODE_VERSION (about 50 MB)"
  mkdir -p "$RUNTIME_DIR"
  fetch_and_unpack "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$NODE_ARCH.tar.gz" -C "$RUNTIME_DIR"
fi
PATH="$NODE_HOME/bin:$PATH"
export PATH

if [ ! -x "$NODE_HOME/bin/pnpm" ]; then
  say "Installing pnpm"
  npm install --global --silent pnpm@11
fi

say "Downloading the app into $APP_DIR"
mkdir -p "$APP_DIR"
# Replaces the code and leaves data/ and .env alone
fetch_and_unpack "$TARBALL_URL" -C "$APP_DIR" --strip-components 1

cd "$APP_DIR"
say "Installing dependencies (a few minutes the first time)"
pnpm install --frozen-lockfile
say "Installing the browser used by some listing sites"
pnpm --filter @housing/sources exec playwright install chromium
say "Building the dashboard"
pnpm build

if [ "${HOUSING_NO_SERVICE:-0}" = "1" ]; then
  say "Done. Start it with: cd $APP_DIR && PATH=$NODE_HOME/bin:\$PATH pnpm start"
  exit 0
fi

say "Starting the background service"
PORT="$PORT" zsh scripts/service.sh install

say "Waiting for the app to answer"
tries=0
until curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 30 ] || fail "the app did not start. Look at $APP_DIR/data/logs/server.log"
  sleep 1
done

open "http://localhost:$PORT"
say "Done. The setup page is open in your browser. Run this same line again any time to update."
printf 'To get a Dock icon, open http://localhost:%s in Safari and choose File, then Add to Dock.\n' "$PORT"
printf 'In Chrome, click the install button at the right end of the address bar.\n'
