#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  bash scripts/codespace-setup.sh
  exit 0
fi
for attempt in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose up -d
echo 'Platform starting at http://localhost:8080. View credentials with: node scripts/admin-password.mjs'
