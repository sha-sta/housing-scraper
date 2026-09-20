#!/bin/zsh
# Runs the watcher as a macOS launchd agent so it starts at login and restarts if it dies.
# caffeinate keeps the Mac from idle-sleeping while the watcher runs. A closed laptop lid still sleeps.
set -euo pipefail

LABEL="com.housing-scraper"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO/data/logs"

usage() {
  echo "usage: scripts/service.sh install | uninstall | status | logs"
  exit 1
}

install() {
  # The service does not read your shell profile, so it records where node and pnpm are right now
  command -v node >/dev/null || { echo "node is not on PATH"; exit 1; }
  command -v pnpm >/dev/null || { echo "pnpm is not on PATH"; exit 1; }
  SERVICE_PATH="$(dirname "$(command -v node)"):$(dirname "$(command -v pnpm)"):/usr/bin:/bin:/usr/sbin:/sbin"
  mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd "$REPO" &amp;&amp; exec caffeinate -is pnpm start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$SERVICE_PATH</string>
    <key>PORT</key><string>${PORT:-4747}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/server.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/server.log</string>
</dict>
</plist>
PLIST_EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Installed. Dashboard: http://localhost:${PORT:-4747}  Logs: $LOG_DIR/server.log"
}

uninstall() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed."
}

case "${1:-}" in
  install) install ;;
  uninstall) uninstall ;;
  status) launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|pid|last exit" || echo "not installed" ;;
  logs) tail -f "$LOG_DIR/server.log" ;;
  *) usage ;;
esac
