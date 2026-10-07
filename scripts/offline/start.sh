#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ -f .env ]] || { echo 'sudo bash scripts/offline/setup-env.sh를 먼저 실행하세요.' >&2; exit 1; }
# No build or download. Existing data/administrator passwords are preserved.
docker compose -f compose.offline.yaml up -d --no-build --pull never --wait --wait-timeout 180
docker compose -f compose.offline.yaml exec -T application npm run db:seed
docker compose -f compose.offline.yaml exec -T application npm run admin:create
curl --fail --silent --output /dev/null http://127.0.0.1/api/events
docker compose -f compose.offline.yaml exec -T application node -e '
fetch("http://127.0.0.1:3000/api/events").then(async r=>{if(!r.ok)throw new Error("HTTP "+r.status);const events=await r.json();if(!Array.isArray(events))throw new Error("잘못된 응답");console.log("웹 서버와 데이터베이스의 정상 응답을 확인했습니다. 활성 대회 수: "+events.length);}).catch(e=>{console.error(e.message);process.exit(1);});'
echo '접속 주소는 .env의 PUBLIC_URL이며 관리자 화면은 해당 주소 뒤에 /admin을 붙입니다.'
echo '초기 확인 후 관리자에서 실제 대회 기간을 설정하세요.'
