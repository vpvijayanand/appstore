#!/bin/bash
# /opt/wlstore/scripts/healthcheck.sh
# Verifies container health, database queries, MinIO storage, and public endpoints.

DOMAIN=${1:-"appstore.yourdomain.com"}
FAILED=0

echo "🔍 Running WL BizStore Production Health Diagnostics..."
echo "======================================================="

# 1. Container status check
echo -n "[1/5] Checking Docker containers... "
for container in wlstore_postgres wlstore_minio wlstore_backend wlstore_portal wlstore_coturn; do
  STATUS=$(docker inspect --format='{{.State.Status}}' $container 2>/dev/null || echo "not_found")
  if [ "$STATUS" != "running" ]; then
    echo -e "\n❌ ERROR: Container $container is $STATUS"
    FAILED=1
  fi
done
[ $FAILED -eq 0 ] && echo "✅ All containers RUNNING"

# 2. Database query test
echo -n "[2/5] Checking PostgreSQL connectivity... "
DB_CHECK=$(docker compose -f docker-compose.yml exec -T postgres pg_isready -U wlstore -d wlstore_db 2>/dev/null)
if [[ $DB_CHECK == *"accepting connections"* ]]; then
  echo "✅ PostgreSQL accepting connections"
else
  echo -e "\n❌ ERROR: PostgreSQL connection failed: $DB_CHECK"
  FAILED=1
fi

# 3. MinIO storage check
echo -n "[3/5] Checking MinIO object storage health... "
MINIO_STATUS=$(docker compose -f docker-compose.yml exec -T minio wget -q -O - http://localhost:9005/minio/health/live 2>&1)
if [ $? -eq 0 ]; then
  echo "✅ MinIO healthy"
else
  echo -e "\n❌ ERROR: MinIO live probe failed"
  FAILED=1
fi

# 4. HTTPS Public Endpoint check
echo -n "[4/5] Checking HTTPS response on https://$DOMAIN... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN)
if [ "$HTTP_CODE" == "200" ]; then
  echo "✅ Admin Portal OK (HTTP 200)"
else
  echo -e "\n⚠️ WARNING: Admin Portal returned HTTP $HTTP_CODE"
fi

# 5. coturn STUN port check
echo -n "[5/5] Checking WebRTC STUN port 3478 (UDP/TCP)... "
if nc -z -v -w5 127.0.0.1 3478 2>/dev/null; then
  echo "✅ STUN port 3478 listening"
else
  echo "⚠️ Note: Verify UDP port 3478 is open in cloud security group"
fi

echo "======================================================="
if [ $FAILED -eq 0 ]; then
  echo "🎉 ALL PLATFORM SUBSYSTEMS HEALTHY & OPERATIONAL"
  exit 0
else
  echo "❌ ONE OR MORE CRITICAL CHECKS FAILED — Review logs with: docker compose logs"
  exit 1
fi
