#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/init-env.mjs
for attempt in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose up -d --build --wait --wait-timeout 240
echo 'Platform ready at http://localhost:8080. View credentials with: node scripts/admin-password.mjs'
