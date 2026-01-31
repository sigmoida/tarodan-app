#!/bin/sh
# Tarodan - Docker PostgreSQL'e eksik sütunları ekler (Prisma şeması ile uyum)
# Kullanım: Proje kökünden ./scripts/sync-db-docker.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_PATH="$SCRIPT_DIR/../apps/api/prisma/scripts/add-users-missing-columns.sql"

if [ ! -f "$SQL_PATH" ]; then
  echo "SQL dosyasi bulunamadi: $SQL_PATH"
  exit 1
fi

echo "Docker PostgreSQL (tarodan-postgres) kontrol ediliyor..."
if ! docker ps --format '{{.Names}}' | grep -q '^tarodan-postgres$'; then
  echo "HATA: tarodan-postgres container calisiyor olmali. Once: docker-compose -f infrastructure/docker-compose.yml up -d"
  exit 1
fi

echo "Eksik users sutunlari ekleniyor..."
docker exec -i tarodan-postgres psql -U postgres -d tarodan -v ON_ERROR_STOP=1 < "$SQL_PATH"

echo "Veritabani Prisma semasi ile uyumlu hale getirildi."
echo "Prisma Studio: pnpm db:studio  -> http://localhost:5555"
