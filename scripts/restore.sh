#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || ! -f "$1" ]]; then echo 'Usage: bash scripts/restore.sh backups/file.dump' >&2; exit 1; fi
docker compose stop application nginx
docker compose exec -T database sh -c 'pg_restore --clean --if-exists --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
docker compose up -d application nginx
