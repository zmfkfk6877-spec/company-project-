#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose -f compose.offline.yaml stop
echo '서버를 정지했습니다. 참가 기록과 DB 볼륨은 보존됩니다.'
