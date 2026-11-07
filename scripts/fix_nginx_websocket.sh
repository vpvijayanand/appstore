#!/bin/bash
# scripts/fix_nginx_websocket.sh
# Fixes WebSocket proxying for WebRTC remote screen share on the host VPS.
# Run with: sudo bash scripts/fix_nginx_websocket.sh

set -e

echo "🔍 Locating active Nginx configuration for appstore.vijayanandpremnath.cloud..."

CONF_FILE=""
for candidate in \
    "/etc/nginx/sites-available/appstore.vijayanandpremnath.cloud" \
    "/etc/nginx/sites-enabled/appstore.vijayanandpremnath.cloud" \
    "/etc/nginx/conf.d/appstore.vijayanandpremnath.cloud.conf" \
    "/etc/nginx/sites-available/default" \
    "/etc/nginx/sites-enabled/default"; do
    if [ -f "$candidate" ] && grep -q "appstore.vijayanandpremnath.cloud" "$candidate"; then
        CONF_FILE="$candidate"
        break
    fi
done

if [ -z "$CONF_FILE" ]; then
    echo "⚠️  Could not find appstore.vijayanandpremnath.cloud vhost. Checking /etc/nginx/sites-enabled/..."
    CONF_FILE=$(grep -l "18092" /etc/nginx/sites-enabled/* 2>/dev/null | head -n 1 || true)
fi

if [ -z "$CONF_FILE" ]; then
    echo "❌ Could not find nginx configuration file. Please check /etc/nginx/sites-available/."
    exit 1
fi

echo "📄 Found active config at: $CONF_FILE"

# Backup
cp "$CONF_FILE" "${CONF_FILE}.bak.$(date +%s)"
echo "💾 Backed up original config to ${CONF_FILE}.bak.*"

# Check if /ws/signaling is already present
if grep -q "location /ws/signaling" "$CONF_FILE"; then
    echo "ℹ️  'location /ws/signaling' is already present in $CONF_FILE."
else
    echo "⚙️  Adding 'location /ws/signaling' WebSocket proxy block..."
    
    # Insert /ws/signaling block right before "location / {"
    python3 - << 'EOF' "$CONF_FILE"
import sys, re

conf_path = sys.argv[1]
with open(conf_path, 'r') as f:
    content = f.read()

ws_block = """
    # WebRTC signaling (remote screen-share SDP/ICE relay)
    location /ws/signaling {
        proxy_pass http://127.0.0.1:18092;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
"""

# Insert before "location / {" if found
if "location /ws/signaling" not in content:
    idx = content.find("location / {")
    if idx != -1:
        new_content = content[:idx] + ws_block + "\n    " + content[idx:]
    else:
        # Append before last closing brace
        last_brace = content.rfind("}")
        new_content = content[:last_brace] + ws_block + "\n" + content[last_brace:]
    with open(conf_path, 'w') as f:
        f.write(new_content)
    print("✅ Inserted /ws/signaling configuration block successfully.")
else:
    print("ℹ️  Already contains /ws/signaling.")
EOF
fi

echo "🧪 Testing Nginx configuration..."
nginx -t

echo "🔄 Reloading Nginx service..."
systemctl reload nginx

echo ""
echo "🔍 Verifying WebSocket endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" -H "Sec-WebSocket-Version: 13" "https://appstore.vijayanandpremnath.cloud/ws/signaling")

echo "👉 Probed /ws/signaling returned HTTP status: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "101" ]; then
    echo "🎉 SUCCESS: /ws/signaling is now correctly routed to the backend WebSocket server!"
else
    echo "⚠️  Note: Received status $HTTP_STATUS (expected 401 Unauthorized or 101 Switching Protocols when unauthenticated)."
fi

