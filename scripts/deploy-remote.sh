#!/usr/bin/env bash
# Runs ON the Tarodan VPS, invoked over SSH by GitHub Actions.
# Usage: deploy-remote.sh <image_tag>
# Requires (in the deploy dir's .env or environment):
#   REGISTRY (e.g. ghcr.io/sigmoida), DOMAIN, DB_*, REDIS_*, etc.
set -euo pipefail

IMAGE_TAG="${1:?usage: deploy-remote.sh <image_tag>}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/tarodan}"
COMPOSE_FILE="infrastructure/docker-compose.prod.yml"

cd "$DEPLOY_DIR"

# Record the currently running tag for rollback.
PREV_TAG="$(grep -E '^IMAGE_TAG=' .env 2>/dev/null | cut -d= -f2 || true)"
echo "Previous tag: ${PREV_TAG:-<none>}  ->  New tag: ${IMAGE_TAG}"

# Pin the new tag for compose to read.
if grep -qE '^IMAGE_TAG=' .env 2>/dev/null; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
fi

echo "==> Pulling images"
docker compose -f "$COMPOSE_FILE" pull api web admin

echo "==> Ensuring database is up (needed for migrations)"
docker compose -f "$COMPOSE_FILE" up -d postgres redis

echo "==> Applying migrations (blocking gate)"
# Run migrate deploy with the NEW image BEFORE swapping app containers, so a
# failed/divergent migration aborts the deploy while the old containers keep
# serving. We override --entrypoint because the api image's ENTRYPOINT
# (entrypoint.sh) starts the server and would otherwise ignore this command.
# The app containers' own entrypoint re-runs migrate deploy on start; once
# applied here it is a harmless no-op.
if ! docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint sh api \
      -c "npx prisma migrate deploy --schema=prisma/schema.prisma"; then
  echo "❌ Migration failed — aborting deploy (app containers unchanged)"
  exit 1
fi

echo "==> Bringing up new containers"
docker compose -f "$COMPOSE_FILE" up -d api web admin

echo "==> Smoke test"
smoke_ok=true
for i in $(seq 1 12); do
  if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then break; fi
  sleep 5
  if [ "$i" -eq 12 ]; then smoke_ok=false; fi
done
curl -fsS http://localhost:3000 >/dev/null 2>&1 || smoke_ok=false
curl -fsS http://localhost:3002 >/dev/null 2>&1 || smoke_ok=false

if [ "$smoke_ok" != true ]; then
  echo "❌ Smoke test FAILED — rolling back to ${PREV_TAG:-<none>}"
  if [ -n "${PREV_TAG:-}" ]; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${PREV_TAG}|" .env
    docker compose -f "$COMPOSE_FILE" pull api web admin
    docker compose -f "$COMPOSE_FILE" up -d api web admin
  fi
  exit 1
fi

echo "==> Cleaning up dangling images"
docker image prune -f
echo "✅ Deploy of ${IMAGE_TAG} succeeded"
