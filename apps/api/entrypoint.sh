#!/bin/sh
set -e

# Faz 7.2: aynı imaj hem API'yi hem ayrı worker'ı boot edebilir. Rol PROCESS_ROLE
# env'inden gelir (all=varsayılan tek-process | web=yalnız HTTP | worker=başsız).
ROLE="${PROCESS_ROLE:-all}"

# Migration'lar web/all rolüne ait; worker atlar ki aynı imajdan boot eden iki
# servis migrate deploy'da yarışmasın (migration'ı tek servis çalıştırsın).
if [ "$ROLE" != "worker" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema=prisma/schema.prisma
  echo "Ensuring production reference data..."
  node dist-seed/prisma/seed-production.js
fi

if [ "$ROLE" = "worker" ]; then
  echo "Starting Tarodan worker (PROCESS_ROLE=$ROLE)..."
  exec node dist/worker
else
  echo "Starting API server (PROCESS_ROLE=$ROLE)..."
  exec node dist/main
fi
