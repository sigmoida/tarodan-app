#!/usr/bin/env bash
# ============================================================================
# Staging DB reset + seed — runs ON the staging VPS (invoked by the
# "Staging Reset" GitHub workflow over SSH, or manually by an operator).
#
# Wipes the staging database (prisma migrate reset --force) and reseeds it
# with the compiled seed, restoring the known-clean demo state. Demo images
# come from the shared S3 seed-assets/ prefix via server-side copies.
#
# PROD GUARDS — all three must pass, in order; any failure aborts:
#   1. infrastructure/.env must contain ENV_ROLE=staging (add this line on
#      the staging server ONLY; prod must never have it).
#   2. DOMAIN must not look like production, S3_ENV_PREFIX must not be prod.
#   3. Caller must pass RESET_CONFIRM=STAGING explicitly.
#
# Env knobs: DEPLOY_DIR (default /opt/tarodan), SKIP_BACKUP=1 to skip pg_dump.
# ============================================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/tarodan}"
COMPOSE_FILE="$DEPLOY_DIR/infrastructure/docker-compose.prod.yml"
ENV_FILE="$DEPLOY_DIR/infrastructure/.env"

log() { echo "[staging-reset] $*"; }
die() { echo "[staging-reset] REFUSED: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "env file not found: $ENV_FILE"
[ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"

get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' || true; }

ENV_ROLE="$(get_env ENV_ROLE)"
DOMAIN="$(get_env DOMAIN)"
S3_ENV_PREFIX="$(get_env S3_ENV_PREFIX)"
DB_USER="$(get_env DB_USER)"
DB_NAME="$(get_env DB_NAME)"

# --- Guard 1: the server must self-identify as staging -----------------------
[ "$ENV_ROLE" = "staging" ] ||
  die "ENV_ROLE=staging not set in $ENV_FILE (found: '${ENV_ROLE:-<empty>}'). This is only ever set on the staging server."

# --- Guard 2: hard production fingerprints -----------------------------------
case "$DOMAIN" in
  tarodan.com | www.tarodan.com | tarodan.shop | www.tarodan.shop)
    die "DOMAIN '$DOMAIN' is a production domain." ;;
esac
[ "$S3_ENV_PREFIX" != "prod" ] ||
  die "S3_ENV_PREFIX=prod — refusing to touch production storage/data."

# --- Guard 3: explicit caller confirmation -----------------------------------
[ "${RESET_CONFIRM:-}" = "STAGING" ] ||
  die "RESET_CONFIRM=STAGING not provided by the caller."

cd "$DEPLOY_DIR"
log "guards passed (ENV_ROLE=staging, DOMAIN=$DOMAIN, S3_ENV_PREFIX=${S3_ENV_PREFIX:-<unset>})"

# --- Optional safety backup ---------------------------------------------------
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$DEPLOY_DIR/backups"
  log "pg_dump → backups/staging-pre-reset-$TS.sql.gz"
  docker exec tarodan-postgres pg_dump -U "$DB_USER" "$DB_NAME" |
    gzip > "$DEPLOY_DIR/backups/staging-pre-reset-$TS.sql.gz"
  # keep the last 5 pre-reset backups
  ls -1t "$DEPLOY_DIR"/backups/staging-pre-reset-*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

# --- Reset + seed -------------------------------------------------------------
# Stop app containers so open connections can't block the reset.
log "stopping api + worker..."
docker compose -f "$COMPOSE_FILE" stop api worker

log "prisma migrate reset --force + compiled seed (in api image)..."
docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint sh api -c \
  "npx prisma migrate reset --force --skip-seed --schema=prisma/schema.prisma && node dist-seed/prisma/seed.js"

# Cache is stale after a wipe — flush redis (best effort).
REDIS_PASSWORD="$(get_env REDIS_PASSWORD)"
if [ -n "$REDIS_PASSWORD" ]; then
  log "flushing redis..."
  docker exec tarodan-redis redis-cli -a "$REDIS_PASSWORD" FLUSHALL >/dev/null 2>&1 || log "redis flush failed (non-fatal)"
fi

# Elasticsearch is stale after a wipe too: delete the app indices while the api
# is down — on boot, syncIndexIfEmpty repopulates empty indices from the fresh
# DB automatically (the periodic sync would otherwise leave stale listings for
# up to an hour). Best effort: worst case the hourly reconcile converges.
log "dropping stale elasticsearch indices (products, collections)..."
docker exec tarodan-elasticsearch curl -s -X DELETE "localhost:9200/products,collections" >/dev/null 2>&1 || log "es index drop failed (non-fatal)"

log "starting api + worker..."
docker compose -f "$COMPOSE_FILE" up -d api worker

log "staging reset + seed complete. (Elasticsearch reindexes itself on api boot.)"
