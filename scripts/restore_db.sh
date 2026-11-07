#!/bin/bash
# scripts/restore_db.sh — Disaster recovery database restore script
# Usage: ./scripts/restore_db.sh /path/to/backup_file.sql.gz

set -e

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Please specify a valid backup file to restore."
  echo "Usage: $0 /path/to/wlstore_backup_YYYYMMDD_HHMMSS.sql.gz"
  exit 1
fi

echo "⚠️  WARNING: This will overwrite the current 'wlstore_db' database!"
read -p "Are you sure you want to proceed? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Restore aborted by user."
  exit 0
fi

DOCKER_CMD="docker compose"
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
  DOCKER_CMD="docker-compose"
fi

echo "🛑 Stopping backend API during database restore..."
$DOCKER_CMD stop backend

echo "🗑️  Re-creating database wlstore_db..."
$DOCKER_CMD exec -T postgres psql -U wlstore -c "DROP DATABASE IF EXISTS wlstore_db;"
$DOCKER_CMD exec -T postgres psql -U wlstore -c "CREATE DATABASE wlstore_db OWNER wlstore;"

echo "📥 Restoring from $BACKUP_FILE..."
zcat "$BACKUP_FILE" | $DOCKER_CMD exec -T postgres psql -U wlstore -d wlstore_db

echo "🚀 Restarting backend API..."
$DOCKER_CMD start backend

echo "🎉 Database restore completed successfully!"
