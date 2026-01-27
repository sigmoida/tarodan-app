#!/bin/bash
# Railway Post-Deploy Script for Prisma Migrations
# This script runs after the build completes

set -e

echo "🚀 Running Railway post-deploy setup..."

# Navigate to API directory
cd apps/api || exit 1

# Generate Prisma Client (if not already done in build)
echo "📦 Generating Prisma Client..."
pnpm prisma generate

# Run migrations
echo "🔄 Running database migrations..."
pnpm prisma migrate deploy

# Seed database (only if needed, uncomment if you want auto-seeding)
# echo "🌱 Seeding database..."
# pnpm prisma db seed

echo "✅ Railway setup complete!"
