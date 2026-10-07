#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
quiz_backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$quiz_backup_dir"
docker compose -f compose.offline.yaml exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$quiz_backup_dir/database.dump"
cp .env "$quiz_backup_dir/environment.env"
docker compose -f compose.offline.yaml exec -T application tar -C /app/uploads -czf - . > "$quiz_backup_dir/uploads.tar.gz"
echo "백업 저장 위치: $quiz_backup_dir"
echo '백업에는 개인정보와 비밀키가 포함됩니다. 기관의 보호된 백업 저장소에 보관하세요.'
