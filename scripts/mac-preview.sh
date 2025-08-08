#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-3000}
URL="http://localhost:${PORT}"

# Try Chromium/Google Chrome first for kiosk-like control
if command -v /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome >/dev/null 2>&1; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="${URL}" --new-window --window-size=1280,400 --user-data-dir="$HOME/.hdisplay-chrome" &
  exit 0
fi

# Fallback to Safari via AppleScript
osascript <<EOF
set theURL to "${URL}"
tell application "Safari"
  activate
  make new document with properties {URL:theURL}
end tell

tell application "System Events"
  tell process "Safari"
    set position of front window to {0, 0}
    set size of front window to {1280, 400}
  end tell
end tell
EOF
