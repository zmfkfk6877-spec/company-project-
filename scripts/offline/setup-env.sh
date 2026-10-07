#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
if [[ -e .env ]]; then
  echo '기존 .env가 있습니다. 덮어쓰지 않았습니다.'
  exit 0
fi
read -r -p '직원들이 접속할 주소 (예: http://10.20.30.40): ' QUIZ_PUBLIC_URL
read -r -p '관리자 아이디 [admin]: ' QUIZ_ADMIN_USERNAME
QUIZ_ADMIN_USERNAME=${QUIZ_ADMIN_USERNAME:-admin}
read -r -s -p '관리자 비밀번호 (12자 이상, 영문/숫자/특수문자 포함): ' QUIZ_ADMIN_PASSWORD
printf '\n'
read -r -s -p '관리자 비밀번호 다시 입력: ' QUIZ_ADMIN_PASSWORD_CONFIRM
printf '\n'
if [[ "$QUIZ_ADMIN_PASSWORD" != "$QUIZ_ADMIN_PASSWORD_CONFIRM" ]]; then
  echo '두 비밀번호가 다릅니다. 다시 실행하세요.' >&2; exit 1
fi
export QUIZ_PUBLIC_URL QUIZ_ADMIN_USERNAME QUIZ_ADMIN_PASSWORD
quiz_env_tmp=$(mktemp .env.tmp.XXXXXX)
trap 'rm -f "$quiz_env_tmp"; unset QUIZ_ADMIN_PASSWORD QUIZ_ADMIN_PASSWORD_CONFIRM' EXIT
docker run --rm --pull=never --network none -i \
  -e QUIZ_PUBLIC_URL -e QUIZ_ADMIN_USERNAME -e QUIZ_ADMIN_PASSWORD \
  phishing-quiz:local node --input-type=module - < scripts/offline/write-env.mjs > "$quiz_env_tmp"
chmod 600 "$quiz_env_tmp"
mv "$quiz_env_tmp" .env
echo '.env 생성 완료. 비밀번호와 키는 화면에 출력하지 않았습니다.'
echo 'https 주소를 선택했다면 HTTPS 설정도 적용해야 접속할 수 있습니다.'
