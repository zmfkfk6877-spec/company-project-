#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p backups
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/quiz-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo 'Database backup saved in backups/. Also back up the uploads volume and encryption keys securely.'
