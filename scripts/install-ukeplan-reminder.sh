#!/bin/zsh
# Install the weekly ukeplan reminder (Sundays 18:00) as a user LaunchAgent.
set -e

ROOT="$HOME/FamilyDash"
NODE="$HOME/.local/bin/node"
PLIST="$HOME/Library/LaunchAgents/com.familyhub.ukeplan-reminder.plist"
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
  <key>Label</key><string>com.familyhub.ukeplan-reminder</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/ukeplan-reminder.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>18</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/familyhub-ukeplan.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/familyhub-ukeplan.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID_NUM/com.familyhub.ukeplan-reminder" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/com.familyhub.ukeplan-reminder"

echo "Installed: $PLIST (Sundays at 18:00)"
echo "Test it now with: node scripts/ukeplan-reminder.mjs"
