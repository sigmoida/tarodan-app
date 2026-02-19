#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma || echo "Migration failed or no pending migrations"

echo "Starting API server..."
exec node dist/src/main
