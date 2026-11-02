#!/bin/zsh
# Install (or reinstall) the Family Hub school-inbox watcher as a user LaunchAgent.
set -e

ROOT="$HOME/FamilyDash"
NODE="$HOME/.local/bin/node"
PLIST="$HOME/Library/LaunchAgents/com.familyhub.school-inbox.plist"
UID_NUM="$(id -u)"

if [ ! -x "$NODE" ]; then
  echo "Node not found at $NODE" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.familyhub.school-inbox</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/school-inbox.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/familyhub-inbox.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/familyhub-inbox.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID_NUM/com.familyhub.school-inbox" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/com.familyhub.school-inbox"
launchctl kickstart -k "gui/$UID_NUM/com.familyhub.school-inbox"

sleep 1
echo "Installed: $PLIST"
launchctl print "gui/$UID_NUM/com.familyhub.school-inbox" 2>/dev/null | grep -E "^\s*(state|pid|program) " | head -5
