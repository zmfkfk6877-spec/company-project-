# 설계

Nginx (HTTPS 종단, 신뢰하는 단일 프록시) → Next.js App Router → Prisma → PostgreSQL. 참가자와 관리자 세션 쿠키는 분리합니다. 정답은 문제은행·배정 스냅샷·답안 테이블에서만 유지합니다. 참가 API는 명시적인 필드 선택으로 직렬화합니다. 프론트에 전체 문제은행이나 진행 중 채점 데이터를 보내지 않습니다.

## 화면 흐름

메인 → 등록·동의 → 준비 → 3초 카운트다운 → 서버 응시 생성 → 단일 메일 판별 → 서버 답안 저장 → 다음 메일 → 시간/문제 소진 종료 → 개인 결과. 세션 쿠키가 남으면 새로고침/재접속에서 서버 진행상태를 복원합니다. 쿠키를 삭제했으면 동일 정보 재등록으로 남은 응시를 복원합니다. 완료 기록은 재등록을 차단합니다. 관리자 응시 초기화는 기록과 세션을 삭제합니다.

## 관계

Admin 1:N Session; Event 1:N Participant; Participant 1:N Attempt; Event 1:N Attempt; Attempt 1:N AssignedQuestion; AssignedQuestion 1:0..1 Answer; Attempt 1:N Answer. Question은 배정 시 JSON 스냅샷을 생성하므로 삭제·수정이 기존 응시에 영향을 주지 않습니다. AuditLog는 개인정보 삭제 후에도 식별 불가능한 대상 ID와 작업 메타데이터만 보존합니다.

## 경쟁의 정합성

등록은 Event+정규화 성명+전화번호 HMAC에 고유 제약을 두고 advisory lock으로 경합을 직렬화합니다. 시작은 Participant, 제출은 Attempt 행 잠금을 사용합니다. 중복 제출은 현재 진행상태를 반환하며 두 번 채점하지 않습니다. 서버 만료시각은 개인 제한시간과 대회 종료시간 중 이른 시각입니다. 현재 문제만 제출 가능하며 클라이언트 점수/시간/문제 ID를 신뢰하지 않습니다.

난이도·정상메일 비율을 10개 블록마다 함께 만족하는 문제를 뽑습니다. 소수 비율은 최대 나머지법으로 반올림합니다. 조건을 만족하는 다음 블록이 없으면 배정을 중단하며 비율을 임의로 완화하지 않습니다. 적어도 10개를 배정하지 못하면 시작을 거절합니다. 각 응시 안에서는 문제를 반복하지 않습니다. 문제 소진은 조기 종료됩니다. 더 많은 응답을 허용하려면 문제은행을 늘리세요.

순위: 점수 DESC → 반올림 전 정확도 DESC → 정답수 DESC → 총 응답시간 ASC → 응시 ID ASC. 완전 동점은 고정된 ID로 순서를 정합니다. 복수 응시 허용 시 참가자별 최고 성적이 순위에 들어가며 개인 결과의 점수는 가장 최근 응시, 순위는 최고 기록 기준입니다. 기본 1회 운영에서는 동일합니다. 참여자 수는 완료 참가자 수입니다.

## API

| Method       | 경로 (`/api` 기준)                       | 용도                                     |
| ------------ | ---------------------------------------- | ---------------------------------------- |
| GET          | /events                                  | 운영 대회 정보                           |
| POST         | /register                                | 정보·동의 확인, 참가 세션                |
| GET          | /attempt                                 | 진행 복원/만료 처리                      |
| POST         | /attempt/start                           | 서버 시작, 균형 배정                     |
| POST         | /attempt/answer                          | 현재 assignmentId와 NORMAL/PHISHING 제출 |
| GET          | /result                                  | 자신의 종료 결과                         |
| GET          | /review                                  | 종료+공개 설정 후 자신의 응답 해설       |
| POST         | /admin/login, /admin/logout              | 인증                                     |
| GET          | /admin/me, /admin/settings               | 관리자 정보                              |
| PATCH        | /admin/settings                          | 비밀번호 변경, 세션 해제                 |
| GET/POST     | /admin/events, /admin/questions          | 목록/생성                                |
| PATCH/DELETE | /admin/events/:id, /admin/questions/:id  | 수정/삭제                                |
| POST         | /admin/questions/:id/copy                | 문제 복사                                |
| POST         | /admin/upload                            | 이미지 검사·재인코딩                     |
| GET          | /admin/events/:id/dashboard              | 운영 집계                                |
| GET          | /admin/events/:id/results, /participants | 마스킹 목록·검색                         |
| GET          | /admin/events/:id/export                 | 개인정보 포함 CSV, SUPERADMIN만          |
| POST         | /admin/events/:id/purge                  | 전체 참가자 삭제                         |
| POST         | /admin/participants/:id/reset            | 응시 초기화                              |
| DELETE       | /admin/participants/:id                  | 개인정보 삭제                            |
| GET          | /admin/audit                             | 감사로그 최근 500건                      |
| GET          | /media/:filename                         | 인증된 훈련 이미지                       |

## 추가 보호와 한계

전화번호 AES-256-GCM, 중복 식별 HMAC, 관리자 bcrypt, 무작위 세션 토큰 SHA-256 저장, Origin 검사·SameSite 쿠키, DB 로그인 제한, 업로드 크기/픽셀 제한·PNG 변환, CSV 수식 이스케이프. 기관 VPN·사내망에서 운영 권장. 이름+전화 입력은 실명 인증이 아니므로 타인의 정보를 아는 사람을 막으려면 기관 SSO 또는 사번 인증을 별도 연계해야 합니다. 키보드·자동화 제출을 절대적으로 방지하지는 않으며 빠른 답변을 관리자에게 표시합니다. IP 제한은 신뢰하는 Nginx 뒤에서만 정확합니다. MFA는 현재 미구현이며 관리자 로그인 계층에 향후 연동합니다.
