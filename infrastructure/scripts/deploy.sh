#!/usr/bin/env bash
# VPS deploy (spec §22-2/3): build images, migrations first, start new containers, smoke test, roll back on failure.
set -euo pipefail
cd /opt/roi/next
PREV=$(docker compose -f infrastructure/docker/docker-compose.prod.yml images -q web 2>/dev/null | head -1 || true)
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file /opt/roi/.env build
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file /opt/roi/.env run --rm web sh -c "npx prisma migrate deploy --config packages/database/prisma.config.ts && npx tsx packages/database/seed/seed.ts"
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file /opt/roi/.env up -d
for i in $(seq 1 30); do curl -fsS http://localhost:3000/api/health >/dev/null && break; sleep 2; done
if ! curl -fsS http://localhost:3000/api/health >/dev/null; then
  echo "SMOKE: FAILED — rolling back"
  [ -n "$PREV" ] && docker tag "$PREV" roi-web:rollback && docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file /opt/roi/.env up -d
  exit 1
fi
echo "DEPLOY: OK"
docker image prune -f >/dev/null
