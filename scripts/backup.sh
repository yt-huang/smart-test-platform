#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$backup_dir"
docker compose stop platform browser-agent
trap 'docker compose start platform browser-agent' EXIT
docker compose exec -T postgres pg_dump --clean --if-exists -U platform -d platform > "$backup_dir/database.sql"
docker compose run --rm --no-deps --user root --entrypoint tar platform -czf - -C /app/evidence . > "$backup_dir/evidence.tar.gz"
docker compose run --rm --no-deps --user root --entrypoint tar browser-agent -czf - -C /agent-data . > "$backup_dir/agent-data.tar.gz"
echo "Backup saved to $backup_dir; retain .env separately in a secure location."
