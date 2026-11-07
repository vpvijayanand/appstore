#!/bin/bash
# scripts/backup_db.sh — Automated PostgreSQL daily backup script
# Usage: ./scripts/backup_db.sh [BACKUP_DIR]

set -e

BACKUP_DIR=${1:-"/opt/wlstore/backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/wlstore_backup_$TIMESTAMP.sql.gz"

echo "📦 Creating PostgreSQL backup at $BACKUP_FILE..."

# Find docker-compose or docker compose
DOCKER_CMD="docker compose"
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
  DOCKER_CMD="docker-compose"
fi

$DOCKER_CMD exec -T postgres pg_dump -U wlstore wlstore_db | gzip > "$BACKUP_FILE"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup completed successfully: $BACKUP_FILE ($FILE_SIZE)"

# Retain only last 30 days of backups
echo "🧹 Pruning backups older than 30 days..."
find "$BACKUP_DIR" -type f -name "wlstore_backup_*.sql.gz" -mtime +30 -delete
echo "✅ Pruning complete."

