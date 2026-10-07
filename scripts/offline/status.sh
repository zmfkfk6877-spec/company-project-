#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose -f compose.offline.yaml ps
echo '오류 로그: sudo docker compose -f compose.offline.yaml logs --tail=80 application'
