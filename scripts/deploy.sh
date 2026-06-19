#!/usr/bin/env bash
#
# Server-side deploy: rebuild + restart the Contento Docker stack on the VPS.
# Invoked by .github/workflows/deploy.yml over SSH AFTER it fast-forwards the repo,
# or run by hand:  bash scripts/deploy.sh
#
# Prerequisites on the server (one-time — see docs/superpowers/runbooks/deploy-setup.md):
#   - Docker + Docker Compose v2 installed
#   - this repo cloned, infra/.env filled with secrets
#   - the database schema synced (migrations applied or `prisma db push`)
#
# Non-destructive: never runs `down -v` (volumes/data are preserved).

set -euo pipefail

# Resolve repo root (script lives in scripts/).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f infra/.env ]; then
  echo "ERROR: infra/.env is missing. Copy infra/.env.example to infra/.env and fill in secrets." >&2
  exit 1
fi

echo "==> Building + (re)starting the stack (infra/docker-compose.yml)…"
# The 'migrate' one-shot (prisma migrate deploy) runs automatically as an app dependency.
docker compose -f infra/docker-compose.yml up -d --build

echo "==> Pruning dangling images…"
docker image prune -f

echo "==> Done. Service status:"
docker compose -f infra/docker-compose.yml ps
