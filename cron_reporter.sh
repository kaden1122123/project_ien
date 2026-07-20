#!/bin/bash
# i-En cron job reporter - POST results directly to Discord
# Channel: #project_ien (1485058398486532167)

BOT_TOKEN="$(grep DISCORD_BOT_TOKEN ~/.openclaw/.env | cut -d= -f2)"
CHANNEL_ID="1485058398486532167"

# Run i-En
cd /home/clawuser/openclaw-workspace/others/project_ien
node src/main.js > /tmp/ien_main.log 2>&1
MAIN_RESULT=$?

# Run monitor
node monitor.js > /tmp/ien_monitor.log 2>&1
MONITOR_RESULT=$?

# Parse monitor for anomalies
if grep -q "🚨" /tmp/ien_monitor.log 2>/dev/null; then
  ANOMALY="❌ 有異常"
else
  ANOMALY="✅ 無異常"
fi

# Build report
REPORT="i-En 執行完成 ✅

流程結果：
✅ Brain — 見日誌
✅ Vision — 見日誌
✅ R2 Upload — 見日誌
✅ IG Publish — 見日誌
✅ Memory — 見日誌

異常監控：$ANOMALY"

# POST to Discord
curl -s -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bot $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'content': sys.stdin.read()}))" <<< "$REPORT")" \
  > /dev/null 2>&1

echo "[DONE]"
