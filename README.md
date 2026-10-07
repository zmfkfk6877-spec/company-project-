# 메일 인사이트 — 피싱메일 판별 퀴즈대회

기관 임직원이 제한시간 동안 업무 메일을 정상/피싱으로 판별하는 서버 기반 대회 시스템입니다. 기본 제한시간 5분, 정답 +2점, 오답 −2점, 1인 1회입니다. **정답·해설·현재 점수는 진행 중 참가 API나 JavaScript 번들에 포함되지 않습니다.**

## 파일 다운로드와 폐쇄망 설치

처음 설치하는 사용자는 [Rocky Linux 8 초보자 안내서](docs/offline/BEGINNER-GUIDE.ko.md)를 먼저 읽으세요. [안내서 PDF](docs/offline/offline-guide.pdf)도 제공합니다.

**[실행 꾸러미 받기 — GitHub Releases](https://github.com/zmfkfk6877-spec/company-project-/releases/tag/offline-rocky8-v1)**: Assets에서 `phishing-quiz-offline.tar.gz`를 다운로드하세요. 앱·PostgreSQL·Nginx 이미지가 들어 있습니다. Docker 설치용 RPM은 안내서대로 별도로 준비해야 합니다.

소스코드는 이 페이지 위의 **Code → Download ZIP**으로 받을 수 있습니다. 소스 ZIP에는 Docker 실행 이미지가 포함되지 않습니다.

## 기능

- 대회 운영기간, 개인 제한시간, 점수, 난이도·정상메일 비율, 횟수, 부서 목록, 보유기간 설정
- 등록·개인정보 동의·3초 카운트다운·메일 관찰·즉시 다음 문제·자동 종료
- 서버 시간 통제, 현재 배정 문제 검사, 중복 답안 방지, 새로고침/재접속 복원
- 50개의 독자적인 샘플 문제: 정상 20 / 피싱 30, 난이도 15 / 20 / 15
- 10개 블록마다 난이도와 정상메일 비율을 동시에 유지하는 무작위 배정
- 개인 결과·현재/최종 순위, 종료 후 관리자 공개 설정에 따른 개인 해설
- 관리자 대시보드, 대회/문제 CRUD·복사·활성 상태·이미지 업로드·미리보기
- 참가자 검색·응시 초기화·개인정보 삭제·정렬·전체 결과 CSV 다운로드
- 관리자 역할(SUPERADMIN, OPERATOR, VIEWER), 비밀번호 변경, 감사로그

CSV 형식을 지원하며 XLSX 형식은 제공하지 않습니다. 별도 수상자·경품 관리 기능은 없습니다. 문제은행을 소진하면 조기 종료되며 더 많은 문제는 관리자 화면에서 추가합니다.

## 기술 및 구조

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL 17 · Nginx · Docker Compose. 실행 시 외부 SaaS, 폰트 CDN, 인증 API가 필요하지 않습니다. 설치 시 npm, Docker 이미지 저장소, Prisma 엔진 배포 서버에 접근해야 합니다.

```text
HTTPS → Nginx → Next.js → PostgreSQL
                   └── uploads (로컬 파일/볼륨)
```

```text
app/                 참가자·관리자 화면, API 라우터
components/Mail.tsx  공통 메일 표시/주소 관찰
lib/                 인증·암호화·검증·출제·채점·순위
prisma/              Schema, 마이그레이션, 50개 콘텐츠, seed
scripts/             관리자 생성, 보유기간 정리, 백업/복구
nginx/               HTTP 설정, HTTPS 설정 예시
tests/               엔진·DB/API 통합 테스트, 브라우저 검증
public/              내부 정적 리소스
compose.yaml         application / database / nginx
```

상세 DB 관계·API·정책은 [설계 문서](docs/architecture.md)를 참고하세요.

## 개발 환경

Node.js 24, npm, Docker Compose 플러그인이 필요합니다. `/workspace/company-project-`의 기존 체크아웃을 사용하며 작업마다 worktree를 만들 필요는 없습니다.

```bash
cp .env.example .env
# .env에서 모든 CHANGE_ME/REPLACE 항목을 변경합니다.
# 안전한 난수: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm ci
npm run db:generate
# 로컬 PostgreSQL 예시. .env에 입력한 DB 사용자/암호를 사용하세요.
docker run -d --name phishing-quiz-db --env-file .env -p 127.0.0.1:5432:5432 postgres:17-alpine
npm run db:migrate
npm run db:seed
npm run admin:create
npm run dev
```

브라우저에서 개발 서버의 3000 포트를 이용합니다. 관리자 페이지 경로는 `/admin`입니다. 초기 계정은 `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD`로 생성됩니다. 자동으로 고정 암호를 제공하지 않으며, 초기 암호는 로그에 출력하지 않습니다. 최초 로그인 후 시스템설정에서 비밀번호를 변경하고 초기 암호 환경변수는 제거하세요. 같은 계정으로 `admin:create`를 반복하면 기존 비밀번호를 유지합니다.

Seed는 이미 존재하는 문제와 이벤트를 덮어쓰지 않습니다. 기본 이벤트는 2026년 한국시간 기준으로 열려 있으므로 운영 전에 실제 기간으로 수정하거나 비활성화하세요. 테스트용 개인정보는 입력 후 삭제하세요.

### 환경변수

| 이름                                 | 용도                                               |
| ------------------------------------ | -------------------------------------------------- |
| DATABASE_URL                         | PostgreSQL 연결 URL (암호의 특수문자는 URL 인코딩) |
| POSTGRES_USER/PASSWORD/DB            | Docker PostgreSQL 초기 생성 설정                   |
| SESSION_SECRET                       | 중복 식별 HMAC 키, 32자 이상의 충분한 난수         |
| ENCRYPTION_KEY                       | 전화번호 AES-256-GCM 키, 64자리 hex                |
| PUBLIC_URL                           | 실제 서비스 Origin, 예: https://quiz.example.org   |
| COOKIE_SECURE                        | HTTPS 운영에서는 true                              |
| TRUST_PROXY                          | 제공된 Nginx 뒤에서만 true                         |
| ADMIN_ALLOWED_IPS                    | 선택: 쉼표로 구분한 실제 관리자 IP                 |
| ADMIN_USERNAME/INITIAL_PASSWORD/ROLE | 초기 계정 생성 시 사용                             |
| UPLOAD_DIR                           | 훈련 이미지 저장 위치, Compose에서는 /app/uploads  |

키와 DB를 함께 안전하게 백업하세요. ENCRYPTION_KEY가 없으면 기존 전화번호를 복원할 수 없습니다. SESSION_SECRET 변경 시 중복 식별이 달라지므로 기존 참가자가 있는 대회에서 임의로 교체하지 마세요. `.env`는 Git에 포함되지 않습니다.

## 검사

```bash
npm run typecheck
npm test
npm run build
npm run start
# Chromium이 설치되어 있으면 (CHROMIUM_PATH로 경로 변경 가능)
npm run test:browser
```

통합 테스트는 연결된 DB에서 `test-*` 대회·계정을 생성하고 종료 시 삭제합니다. 문제 seed가 필요하며 테스트를 전용 개발 DB에서 실행하세요. 시간초과 테스트는 서버 DB의 expiresAt을 지난 시각으로 설정해 검증하므로 5분을 기다리지 않습니다. 브라우저 테스트는 별도 명령과 실행 결과 문서를 참고하세요. 100명 동시 응시 테스트는 동일 DB에서 100개 시작 및 복원을 검증하며 실제 네트워크·기관 인프라의 용량 보증은 아닙니다.

## Docker 운영

```bash
# .env: PUBLIC_URL, POSTGRES_*, 강한 키/암호를 설정
# 운영 HTTPS 구성 후 COOKIE_SECURE=true로 설정
# 처음에는 HTTP로 내부 동작을 확인할 수 있습니다 (COOKIE_SECURE=false).
docker compose up -d --build
docker compose exec application npm run db:seed
docker compose exec application npm run admin:create
```

application은 시작 시 저장된 migration을 적용하고 서버를 실행합니다. DB healthcheck 이후 시작하며 Nginx는 앱 healthcheck 이후 시작합니다. 데이터베이스와 application 포트는 호스트에 공개하지 않습니다. Docker 볼륨 `database`, `uploads`에 데이터를 유지합니다. 볼륨 삭제 명령(`down -v`)은 데이터를 삭제하므로 운영에서 사용하지 마세요.

### HTTPS

기관 인증서를 발급받아 서버의 보호된 디렉터리에 배치합니다. `nginx/https.conf.example`의 `server_name`을 실제 도메인으로 변경하고 default.conf 대신 마운트합니다. Compose의 Nginx에 `443:443` 포트와 `/etc/nginx/tls` 읽기전용 인증서 마운트를 추가하세요. `.env`의 `PUBLIC_URL=https://실제도메인`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`를 설정 후 재시작합니다. 현재 HTTP 설정은 로컬 검증용이며 외부 운영 전에 HTTPS 구성이 필요합니다.

기관 외부망에서는 관리자 IP 제한 또는 VPN을 사용하세요. 앱에 직접 접근할 수 있게 포트를 공개하고 TRUST_PROXY=true로 운영하면 IP 헤더를 위조할 수 있습니다.

## 운영 방법

1. 관리자 **대회관리**에서 제목, 기간(한국시간), 제한시간, 비율, 부서·보유기간을 설정합니다.
2. **문제은행**에서 신규 문제의 본문·발신자·링크·첨부·정답·해설을 입력합니다. 링크는 문자열로만 저장되고 훈련 화면에서 이동하지 않습니다. 본문은 HTML이 아닌 텍스트입니다.
3. 이미지는 검증 후 PNG로 재인코딩됩니다. QR 시나리오에서는 안전한 훈련 이미지와 확인용 URL 문자열을 함께 제공하세요. 실제 의심 사이트로 연결되는 QR을 넣지 마세요.
4. 미리보기로 관찰 요소를 확인하고 활성화합니다. 비율에 맞는 10개 이상을 배정할 수 있어야 시작 가능합니다.
5. 대시보드로 현황을 보고, 결과조회/순위에서 필요한 정렬과 검색을 적용합니다.
6. SUPERADMIN이 CSV로 전체 전화번호를 내려받을 수 있습니다. OPERATOR는 대회·문제·응시 초기화, VIEWER는 마스킹 조회만 가능합니다.
7. 종료 후 필요하면 해설 공개를 켭니다. 전체/개별 참가자 삭제는 개인정보와 응시·답안·세션을 연쇄 삭제합니다.

### 개인정보 보유기간 정리

```bash
docker compose exec -T application npm run privacy:purge
```

이 명령을 기관 스케줄러/cron에서 매일 실행하세요. 종료시각+보유일수를 넘은 대회의 참가자를 삭제하며 만료 세션과 rate-limit 기록도 정리합니다. 기본적으로 웹 요청 안에서 자동 삭제하지 않습니다. 로그 보유기간은 기관 정책에 따라 별도 운영해야 합니다.

### 백업·복구

```bash
bash scripts/backup.sh
# 복구는 서비스 중단이 필요하며 기존 DB를 변경합니다.
bash scripts/restore.sh backups/quiz-YYYYMMDDTHHMMSSZ.dump
```

uploads 볼륨과 `.env`의 암호화 키도 별도로 보호된 저장소에 백업합니다. 백업 파일에는 개인정보가 포함되므로 암호화·접근통제를 적용하세요. DB 복원 후 샘플 계정으로 전화번호 복호화와 결과 조회를 확인하세요.

### 로그

```bash
docker compose logs -f application nginx database
```

관리자 행위는 DB AuditLog와 관리자로그 화면에 표시됩니다. 오류 응답에는 내부 스택/SQL을 노출하지 않습니다. 서버 오류 로그는 경로와 오류 유형을 기록합니다. 운영 로그에 개인정보/세션 쿠키를 추가하지 마세요.

## 보안 범위 및 운영 전 점검

실명/휴대전화 소유 인증, 관리자 MFA, 기관 SSO는 제공하지 않습니다. 이름+전화번호를 아는 다른 사람이 등록할 수 있으므로 실명 확인이 필요한 행사에는 기관 인증 연동이 필요합니다. 자동화 응답을 완전히 차단하지는 않으며 0.8초 미만 응답을 표시합니다. 순위 기준의 모든 항목이 같으면 응시 ID 순으로 결정합니다.

동시 100명 DB/API 검사 외에 운영 네트워크 부하, HTTPS 인증서, 실제 백업 복구, 기관 접근통제/개인정보 정책은 해당 서버에서 검증해야 합니다. 구현 검증 결과와 미검증 항목은 [검증 기록](docs/validation.md)에 구분해 기록합니다.

## 클라우드 환경 재시작

```bash
node scripts/cloud-prepare.mjs --install
npm run build
npm run start
```

기존 체크아웃과 `.env`를 보존합니다. `.env`가 없을 때만 로컬 개발용 난수 키·암호를 생성합니다. PostgreSQL 컨테이너가 없으면 생성하고 `.local/cloud-db.dump`가 있으면 복원합니다. 기존 실행 DB가 있으면 이를 그대로 사용합니다. 준비 명령은 현재 DB의 백업을 갱신하므로 환경을 게시하기 전 다시 실행하세요. `.local`은 Git에 포함되지 않는 개인정보 포함 로컬 상태입니다. 외부 운영 DB URL은 자동 Docker 생성·덤프 대상에서 제외됩니다. 이 도구는 로컬 개발용이며 운영 Compose 배포에는 위의 별도 절차를 사용합니다.

### Docker 내부 다운로드가 제한된 경우

Linux x86_64 / Node.js 24 개발환경에서 설치·빌드를 완료한 후:

```bash
npm ci
npm run db:generate
npm run build
bash scripts/package-image.sh
docker compose -f compose.yaml -f compose.prebuilt.yaml up -d
```

`Dockerfile.prebuilt`는 설치된 Linux 의존성과 빌드 산출물을 공식 Node Debian 이미지에 패키징합니다. 환경파일은 보내지 않으며 실행 시 `.env`로 주입합니다. 같은 Linux 아키텍처에서만 사용하고 코드·의존성 변경 시 다시 빌드·패키징하세요. 일반 `Dockerfile`은 빌드 컨테이너에서 Alpine·npm·Prisma 배포 서버 접근이 필요합니다.

## 화면 미리보기

자동 브라우저 검증에서 촬영한 화면입니다. 관리자 숫자는 검증용 참가자의 임시 데이터입니다.

[메인](docs/screenshots/home.png) · [메일 판별](docs/screenshots/mail.png) · [결과](docs/screenshots/result.png) · [관리자](docs/screenshots/admin.png) · [모바일](docs/screenshots/mobile.png)

## 폐쇄망 물리 서버에 설치하기

처음 설치하는 사용자는 [Rocky Linux 초보자 안내서](docs/offline/BEGINNER-GUIDE.ko.md)를 따라 진행하세요. 실행 이미지 꾸러미와 Docker 설치용 RPM을 인터넷 환경에서 준비한 뒤 반입합니다. `compose.offline.yaml`과 `scripts/offline/`은 이미지 다운로드 없이 설치·실행·백업하도록 구성되어 있습니다.
