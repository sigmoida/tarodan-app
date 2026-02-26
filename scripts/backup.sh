#!/bin/bash

# Tarodan Backup Script
# This script creates backups of the database and uploaded files (AWS S3)

set -e

BACKUP_DIR="/var/tarodan/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# S3 Configuration (set these or export before running)
S3_BUCKET="${S3_BUCKET:-amzn-tarodan}"
S3_ENV_PREFIX="${S3_ENV_PREFIX:-prod}"

echo "🔄 Starting Tarodan Backup..."

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Database backup
echo "📦 Backing up PostgreSQL database..."
docker exec tarodan-postgres pg_dump -U postgres tarodan | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# S3 backup (uploaded files)
echo "📁 Backing up uploaded files from S3..."
mkdir -p "$BACKUP_DIR/s3_backup_$DATE"
aws s3 sync "s3://$S3_BUCKET/$S3_ENV_PREFIX/" "$BACKUP_DIR/s3_backup_$DATE/" --quiet

# Create combined archive
echo "📦 Creating combined archive..."
tar -czf "$BACKUP_DIR/tarodan_backup_$DATE.tar.gz" \
    -C "$BACKUP_DIR" \
    "db_backup_$DATE.sql.gz" \
    "s3_backup_$DATE"

# Cleanup temporary files
rm -f "$BACKUP_DIR/db_backup_$DATE.sql.gz"
rm -rf "$BACKUP_DIR/s3_backup_$DATE"

# Remove old backups
echo "🗑️ Removing backups older than $RETENTION_DAYS days..."
find $BACKUP_DIR -name "tarodan_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete

echo ""
echo "✅ Backup completed: $BACKUP_DIR/tarodan_backup_$DATE.tar.gz"
echo ""

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/tarodan_backup_$DATE.tar.gz" | cut -f1)
echo "📊 Backup size: $BACKUP_SIZE"

# List recent backups
echo ""
echo "📋 Recent backups:"
ls -lh $BACKUP_DIR/tarodan_backup_*.tar.gz | tail -5
