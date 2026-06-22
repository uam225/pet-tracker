#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — pull the latest pre-built images from GHCR and restart.
#
# Run on the production server after GitHub Actions has finished building
# (check the Actions tab shows a green run for the commit you want live):
#
#   cd ~/pet-tracker && git pull && ./scripts/deploy.sh
#
# The git pull is only needed to update docker-compose.prod.yml, the
# Caddyfile, and this script itself. The application images come from GHCR,
# not from the local checkout.
#
# To deploy a specific version instead of latest (e.g. to roll back):
#   IMAGE_TAG=<commit-sha> ./scripts/deploy.sh
# ---------------------------------------------------------------------------

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"

# Resolve to the project root regardless of where the script is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

echo "[INFO] Pulling images (IMAGE_TAG=${IMAGE_TAG:-latest})..."
docker compose -f "${COMPOSE_FILE}" pull

echo "[INFO] Restarting containers..."
docker compose -f "${COMPOSE_FILE}" up -d

# The frontend is an init container: it copies the new build into the shared
# volume and exits. 'up -d' starts it, but if the image was already present
# it may not re-run. Force it to run so the new static files are published.
echo "[INFO] Refreshing frontend static files..."
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate frontend

echo "[INFO] Pruning old dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "[INFO] Deploy complete. Current status:"
docker compose -f "${COMPOSE_FILE}" ps
