#!/bin/sh
set -e

# One image, three roles. Selected via PROCESS_ROLE (default: api).
#   api       -> HTTP server (dist/main)
#   worker    -> background worker + cron processors (dist/worker)
#   bullboard -> standalone queue monitoring dashboard (dist/bullboard)
ROLE="${PROCESS_ROLE:-api}"

# Run migrations ONLY in the api role so two containers do not race
# 'migrate deploy' (the worker must not run migrations).
if [ "$ROLE" = "api" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema=prisma/schema.prisma || echo "Migration failed or no pending migrations"
fi

case "$ROLE" in
  worker)
    echo "Starting Tarodan worker (dist/worker)..."
    exec node dist/worker
    ;;
  bullboard)
    echo "Starting standalone Bull Board (dist/bullboard)..."
    exec node dist/bullboard
    ;;
  *)
    echo "Starting Tarodan API server (dist/main)..."
    exec node dist/main
    ;;
esac
