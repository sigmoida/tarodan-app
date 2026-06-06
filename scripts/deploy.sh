#!/bin/bash
# DEPRECATED manual entrypoint — kept for emergency manual deploys.
# CI deploys via .github/workflows/deploy-{staging,production}.yml.
# This now delegates to the pull-based deploy-remote.sh (no on-server build).
set -e
ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
DEPLOY_DIR="/opt/tarodan"

cd "$DEPLOY_DIR"
git pull --ff-only
echo "Manual deploy ($ENVIRONMENT) of tag $IMAGE_TAG via deploy-remote.sh"
./scripts/deploy-remote.sh "$IMAGE_TAG"
