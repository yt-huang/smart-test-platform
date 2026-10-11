#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Usage: bash scripts/restore.sh BACKUP_DIRECTORY}"
test -f "$backup_dir/database.sql"
test -f "$backup_dir/evidence.tar.gz"
test -f "$backup_dir/agent-data.tar.gz"
docker compose stop platform browser-agent
trap 'docker compose start platform browser-agent' EXIT
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U platform -d platform < "$backup_dir/database.sql"
docker compose run --rm --no-deps -T --user root --entrypoint tar platform -xzf - -C /app/evidence < "$backup_dir/evidence.tar.gz"
docker compose run --rm --no-deps -T --user root --entrypoint tar browser-agent -xzf - -C /agent-data < "$backup_dir/agent-data.tar.gz"
echo 'Restore completed.'
