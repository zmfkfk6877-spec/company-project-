#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v docker >/dev/null || { echo 'Docker를 먼저 설치하세요.' >&2; exit 1; }
if [[ $(uname -m) != x86_64 ]]; then echo '이 실행 꾸러미는 x86_64(Intel/AMD) 서버용입니다.' >&2; exit 1; fi
sha256sum -c SHA256SUMS
docker load -i images.tar
for image in phishing-quiz:local postgres:17-alpine nginx:1.28-alpine; do docker image inspect "$image" >/dev/null; done
echo '실행 이미지 3개를 불러왔습니다. 인터넷에서 다운로드하지 않았습니다.'
