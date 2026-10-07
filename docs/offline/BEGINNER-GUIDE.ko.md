# 폐쇄망 Rocky Linux 물리 서버 설치 안내서

이 안내서는 코딩을 처음 접하는 분이 피싱메일 퀴즈대회를 실행하기 위한 순서입니다.

**기준 환경: Rocky Linux 8 / Intel·AMD 서버(x86_64).** Rocky 9·10 또는 ARM 서버라면 Docker 설치 파일과 실행 이미지의 호환성을 다시 확인해야 합니다. 현재 물리 서버에서의 설치 검증은 아직 수행하지 않았습니다. 이미 설치된 Rocky 8을 그대로 사용하며, Ubuntu로 재설치할 필요는 없습니다.

## 1. 지금 프로젝트는 어디에 있나요?

현재 프로젝트는 ChatGPT/Codex가 작업한 **클라우드 컴퓨터**의 다음 폴더에 있습니다.

```text
/workspace/company-project-
```

작업 경로는 클라우드 컴퓨터의 폴더입니다. 프로젝트 소스와 안내서는 다음 GitHub 저장소에서도 받을 수 있습니다.

https://github.com/zmfkfk6877-spec/company-project-

소스 파일은 저장소의 **Code → Download ZIP**으로 받으세요. Windows PC라면 보통 **다운로드** 폴더에 저장됩니다.

**실행 꾸러미는 GitHub Releases에서 내려받으세요.**

https://github.com/zmfkfk6877-spec/company-project-/releases/tag/offline-rocky8-v1

페이지 아래 **Assets**를 펼치고 `phishing-quiz-offline.tar.gz`를 선택합니다. 채팅 파일 링크의 40MB 제한 대신 GitHub 다운로드를 사용합니다. `Source code (zip)`만 받으면 실행 이미지가 포함되지 않으므로, 아래 실행 꾸러미를 꼭 받으세요.

| 파일 | 내용 | 이번 설치에 필요? |
|---|---|---|
| phishing-quiz-offline.tar.gz | 앱·DB·웹 서버 이미지 3개, 설정, 실행 도우미 | 필수 |
| phishing-quiz-source.zip | 수정 가능한 전체 소스코드, 설명서 | 보관 권장 |
| offline-guide.html 또는 offline-guide.pdf | 이 설명서 | 권장 |
| download-SHA256SUMS.txt | 내려받은 파일의 무결성 확인 값 | 권장 |

소스코드는 추후 수정용입니다. **실제로 실행할 때는 실행 꾸러미 `phishing-quiz-offline.tar.gz`를 사용합니다.** 이 꾸러미에 애플리케이션과 필요한 라이브러리가 이미 들어 있어서 폐쇄망에서 npm install이나 프로그램 빌드를 할 필요가 없습니다.

## 2. 준비물

### 물리 서버

- Rocky Linux 8 x86_64가 설치된 물리 서버
- 기본 준비 권장: CPU 4코어, RAM 8GB, 여유 디스크 50GB 이상
- 서버 관리자 계정과 sudo 사용 권한
- 전산 담당자가 지정한 고정 내부 IP와 직원 PC에서 해당 IP로 접근 가능한 네트워크
- 직원 PC가 접속할 TCP 80번 포트. 실제 운영 HTTPS에는 443번도 필요합니다.
- 데이터 백업을 보관할 별도 안전한 장소

위 사양은 준비 권장치이며 모든 기관 환경의 최대 처리량을 보장하는 수치는 아닙니다.

### 인터넷이 되는 준비용 환경

- 인터넷이 되는 PC
- 그 PC의 가상머신 또는 별도 테스트 PC에 **폐쇄망 서버와 같은 Rocky 8 및 x86_64** 설치
- 최소 15GB 정도의 준비·다운로드 여유 공간
- 이번에 받은 실행 꾸러미
- Docker 설치 RPM을 내려받을 인터넷 연결

Windows PC만 있어도 됩니다. Windows에서 소스코드를 실행할 필요 없이, VMware/VirtualBox 등에서 인터넷이 되는 Rocky 8 가상머신을 준비하면 됩니다. 가상머신 설치가 처음이라면 이 단계만 전산 담당자에게 도움을 요청하세요.

### 반입 수단

기관에서 허용한 USB 또는 반입 중계 시스템을 사용하세요. Docker RPM과 꾸러미 파일을 같은 반입 폴더에 모읍니다. 일반적인 경우 16GB 이상의 USB가 편합니다. USB 파일시스템은 대상 Rocky에서 읽을 수 있는 것을 사용하세요. 이 꾸러미는 FAT32의 단일 파일 4GB 제한보다 작지만, Rocky 설치 ISO는 별도입니다.

### 담당자에게 물어볼 문장

> Rocky Linux 8 x86_64 서버에 Docker Compose로 내부 웹 서비스를 올리려고 합니다. 서버의 고정 IP, sudo 계정, 내부 PC에서 80/443 포트 접근 가능 여부, 승인된 파일 반입 방법과 내부 HTTPS 인증서 발급 방법을 알려주세요.

## 3. 전체 순서

```text
[인터넷이 되는 PC]
GitHub Releases에서 실행 꾸러미 다운로드
       ↓
[인터넷이 되는 Rocky 준비용 컴퓨터]
Docker 설치 RPM 모으기 + 실행 꾸러미 테스트
       ↓
[승인된 반입 수단]
꾸러미와 RPM 복사
       ↓
[폐쇄망 물리 서버]
Docker 설치 → 이미지 불러오기 → 주소/암호 설정 → 실행
       ↓
[직원 PC]
브라우저로 내부 서버 주소에 접속
```

아래 Linux 명령어는 **각 단계에 표시된 Rocky 컴퓨터의 터미널**에서 입력합니다. 한 줄 입력 후 Enter를 누르세요. `sudo` 명령이 계정 비밀번호를 물으면 서버 계정의 비밀번호를 입력합니다. 비밀번호 입력 중 글자가 표시되지 않는 것은 정상입니다.

## 4. 폐쇄망 서버에 OS가 이미 설치되어 있다면 먼저 확인하기

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
cat /etc/rocky-release
uname -m
ip -br address
```

- 첫 명령: `Rocky Linux release 8...`인지 확인하고 **8.8, 8.10 등 전체 버전**을 기록합니다. 인터넷 준비용 컴퓨터도 가능하면 같은 세부 버전을 사용하세요.
- 두 번째: `x86_64`인지 확인합니다.
- 세 번째: 내부 네트워크 IP를 확인합니다. `127.0.0.1`은 직원 PC가 접속할 서버 주소가 아닙니다. Docker가 만드는 내부 주소와도 구분해야 하므로 전산 담당자가 정한 주소를 사용하세요.

이후 예시의 `10.20.30.40`은 설명용 주소입니다. 실제 서버 IP로 바꾸세요.

사용자 서버에는 Rocky 8이 이미 있으므로 OS 재설치는 건너뜁니다. 다른 준비용 컴퓨터에 아직 OS가 없다면 Rocky 공식 사이트 https://rockylinux.org/download 에서 Rocky 8 x86_64 설치 ISO를 준비하고 서버 OS 설치부터 진행해야 합니다. 폐쇄망 설치에는 필요한 패키지를 포함한 DVD ISO가 편합니다. 설치 디스크 선택은 기존 데이터를 지울 수 있으므로 기존 데이터가 있는 서버라면 담당자와 먼저 확인하세요. 이 안내서는 OS 설치가 끝난 이후의 웹 시스템 설치를 다룹니다.

## 5. 인터넷이 되는 Rocky에서 Docker 설치 파일 모으기

**입력 장소: 인터넷이 되는 Rocky 8 준비용 컴퓨터의 터미널**

다음 폴더에 설치 RPM을 모읍니다.

```bash
mkdir -p ~/quiz-transfer/docker-rpms ~/quiz-transfer/keys
```

RPM은 Rocky에서 사용하는 프로그램 설치 파일입니다. Docker뿐 아니라 Docker 실행에 필요한 다른 패키지도 함께 내려받아야 합니다.

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
```

Rocky 8에서는 호환되는 EL8 Docker CE 패키지를 사용합니다. Rocky 9에서 받은 EL9 RPM을 이 서버에 설치하면 안 됩니다. 오래된 8.x 서버는 새 패키지의 의존성이 맞지 않을 수 있으므로, 반입 전에 같은 세부 버전의 테스트 컴퓨터에서 오프라인 설치를 확인하세요. 기관 표준 Docker 패키지 저장소가 있다면 그 저장소를 우선 사용하세요.

```bash
dnf download --resolve --alldeps --destdir="$HOME/quiz-transfer/docker-rpms" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

이 명령은 의존 패키지도 함께 다운로드합니다. 준비용 컴퓨터와 폐쇄망 서버의 Rocky 버전과 CPU 종류를 맞추는 이유입니다. 성공 메시지가 나왔는지 확인하세요. 오류가 났다면 다음 단계로 넘어가지 말고 오류를 해결해야 합니다.

Docker 패키지 서명 확인에 사용할 공식 키도 저장합니다.

```bash
curl --fail --location https://download.docker.com/linux/centos/gpg --output "$HOME/quiz-transfer/keys/docker.asc"
cp /etc/pki/rpm-gpg/RPM-GPG-KEY-[Rr]ocky* ~/quiz-transfer/keys/
```

위 `[Rr]ocky*`는 Rocky 8의 `RPM-GPG-KEY-rockyofficial` 등 공식 키 파일을 선택합니다. Rocky 키 파일이 없다고 나오면 준비용 OS가 Rocky 8인지 확인하고 담당자에게 문의하세요. 키는 공식 출처에서 받은 것을 사용합니다. 서명 오류를 무시하거나 `--nogpgcheck`를 붙이지 마세요.

실행 꾸러미 `phishing-quiz-offline.tar.gz`도 `~/quiz-transfer/` 폴더에 복사합니다. GUI 파일 탐색기에서 복사해도 됩니다.

그다음 파일 확인 값을 만듭니다.

```bash
cd ~/quiz-transfer
find docker-rpms keys -type f -print0 | sort -z | xargs -0 sha256sum > RPM-SHA256SUMS.txt
```

반입 폴더는 다음처럼 됩니다.

```text
quiz-transfer/
├── phishing-quiz-offline.tar.gz
├── docker-rpms/          여러 개의 .rpm 파일
├── keys/                Docker 키와 Rocky 키
└── RPM-SHA256SUMS.txt
```

**가능하면 같은 버전의 깨끗한 테스트 Rocky 가상머신에서 인터넷을 끈 뒤 7~12단계를 먼저 실행하세요.** 이 검사가 Docker RPM 의존성까지 완전히 모았는지 확인하는 가장 확실한 방법입니다. 이 문서와 함께 제공한 앱 이미지는 클라우드 Linux에서 검증했지만, 물리 서버용 Docker RPM 모음은 이 채팅에서 제공하지 않았으므로 이 단계에서 따로 준비해야 합니다.

## 6. 반입 파일을 물리 서버에 복사하기

**입력 장소: 폐쇄망 물리 서버의 터미널**

기관이 허용한 방식으로 `quiz-transfer` 폴더를 서버에 가져옵니다. 반입 중계 시스템에서 받은 경로를 알고 있다면 다음 예의 USB 마운트 과정은 건너뛰고 7단계로 이동하세요.

USB를 사용한다면 장치를 먼저 확인합니다.

```bash
lsblk -f
```

USB의 용량·라벨을 보고 정확한 파티션을 확인합니다. 다음의 `/dev/sdb1`은 예시이며 **확인한 실제 USB 파티션으로 바꿔야 합니다.** 기존 서버 디스크를 포맷할 필요는 없습니다.

```bash
sudo mkdir -p /mnt/quiz-usb
sudo mount -o ro,nosuid,nodev,noexec /dev/sdb1 /mnt/quiz-usb
ls /mnt/quiz-usb
```

USB 안에 `quiz-transfer` 폴더가 보이는 경우:

```bash
sudo mkdir -p /opt/quiz-transfer
sudo cp -r /mnt/quiz-usb/quiz-transfer/. /opt/quiz-transfer/
sudo umount /mnt/quiz-usb
```

서버에는 이제 `/opt/quiz-transfer`가 있습니다. 이 폴더는 Docker 설치 파일과 프로그램 꾸러미의 보관 장소입니다.

## 7. 폐쇄망 서버에 Docker 설치하기

**입력 장소: 폐쇄망 물리 서버의 터미널**

Docker가 이미 설치되어 있다면 먼저 확인하세요.

```bash
sudo docker version
sudo docker compose version
```

둘 다 정상적으로 나온다면 패키지를 다시 설치하지 않고 8단계로 갈 수 있습니다. Docker Compose 플러그인은 v2.24 이상 또는 호환되는 최신 버전을 권장합니다. `docker-compose`보다 이 문서의 `docker compose` 명령을 사용합니다.

새로 설치하는 경우:

```bash
cd /opt/quiz-transfer
sha256sum -c RPM-SHA256SUMS.txt
sudo rpm --import keys/docker.asc
sudo rpm --import keys/RPM-GPG-KEY-[Rr]ocky*
rpm -K docker-rpms/*.rpm
```

체크섬과 RPM 서명 확인이 정상이어야 합니다. 키 오류·서명 오류·파일 불일치가 있으면 반입 파일과 공식 키를 확인하세요.

이제 인터넷 저장소를 사용하지 않고 반입한 RPM으로 설치합니다.

```bash
sudo dnf --disablerepo='*' --setopt=localpkg_gpgcheck=1 install -y ./docker-rpms/*.rpm
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

`의존 패키지를 찾을 수 없다`는 오류는 RPM 준비가 부족한 것입니다. 인터넷 준비용 Rocky에서 누락 패키지를 추가로 내려받아 다시 반입해야 합니다. 패키지 충돌이 나오면 기존 프로그램을 무작정 삭제하지 말고 전산 담당자와 확인하세요.

## 8. 프로그램 실행 꾸러미 풀기

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
sudo tar -xzf /opt/quiz-transfer/phishing-quiz-offline.tar.gz -C /opt
cd /opt/phishing-quiz-offline
ls
```

다음 파일과 폴더가 보여야 합니다.

```text
/opt/phishing-quiz-offline/
├── images.tar
├── compose.offline.yaml
├── SHA256SUMS
├── nginx/
├── scripts/offline/
└── docs/
```

이후의 명령은 이 폴더에서 실행합니다. 터미널을 다시 열었으면 `cd /opt/phishing-quiz-offline`부터 입력하세요.

## 9. Docker 이미지 불러오기

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
sudo bash scripts/offline/load-images.sh
sudo docker image ls
```

도우미가 파일 체크섬을 확인한 후 아래 이미지 3개를 불러옵니다.

```text
phishing-quiz:local
postgres:17-alpine
nginx:1.28-alpine
```

이미지는 필요한 프로그램이 들어 있는 실행 꾸러미입니다. 불러오기는 서버 디스크에 저장하는 단계이며, 아직 웹 서비스를 시작한 것은 아닙니다. 인터넷 연결은 사용하지 않습니다.

## 10. 서버 주소와 관리자 비밀번호 설정하기

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
sudo bash scripts/offline/setup-env.sh
```

차례대로 질문이 나옵니다.

1. **직원들이 접속할 주소:** 처음 내부 시험을 한다면 `http://실제서버IP`를 입력합니다. 예: `http://10.20.30.40`.
2. **관리자 아이디:** `admin`을 쓰려면 그냥 Enter를 누릅니다.
3. **관리자 비밀번호:** 본인이 정한 12자 이상 비밀번호를 입력합니다. 영문·숫자·특수문자가 모두 필요합니다. 작은따옴표와 역슬래시는 이 도우미에서 사용하지 않습니다.
4. **비밀번호 다시 입력:** 같은 비밀번호를 한 번 더 입력합니다.

데이터베이스 비밀번호와 암호화 키는 자동으로 무작위 생성되어 `.env`라는 파일에 저장됩니다. 이전 클라우드의 개발용 비밀번호·키·참가 데이터는 가져오지 않습니다. 이미 `.env`가 있으면 도우미는 덮어쓰지 않습니다.

관리자 비밀번호는 본인이 입력한 값을 안전하게 기억하세요. 화면에 표시되지 않는 것이 정상입니다. `.env`에는 비밀키가 있으므로 공개하지 마세요. 대회 데이터가 생긴 후 이 파일을 삭제하고 새로 만들면 기존 전화번호 복호화나 중복 식별에 문제가 생깁니다.

## 11. 내부 접속용 방화벽 열기

**입력 장소: 폐쇄망 물리 서버의 터미널**

기관에서 80번 포트 사용이 승인된 경우:

```bash
sudo systemctl is-active firewalld
```

`active`이면 다음을 실행합니다.

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

`inactive`이면 위의 firewall-cmd를 실행할 필요는 없지만 기관의 다른 방화벽이나 네트워크 장비 정책은 별도입니다. 서버 방화벽을 열어도 내부 PC에서 서버로 가는 네트워크가 차단되어 있으면 접속되지 않습니다.

SELinux는 끄지 않습니다. 제공한 Nginx 파일 마운트는 Rocky SELinux용 `Z` 라벨 옵션을 포함합니다.

## 12. 웹 서버 실행하기

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
sudo bash scripts/offline/start.sh
sudo bash scripts/offline/status.sh
```

도우미가 다음을 처리합니다.

- DB·앱·Nginx 시작
- DB 테이블 생성/migration 적용
- 샘플 문제 50개 등록
- 10단계에서 입력한 관리자 계정 생성
- 웹 서버와 DB의 실제 응답 확인

이미 존재하는 문제나 관리자 비밀번호는 덮어쓰지 않습니다. 프로그램 시작에 인터넷 다운로드나 npm install은 필요하지 않습니다. `pull_policy: never`와 `--pull never`로 다운로드를 막았습니다.

정상이라면 세 서비스가 실행 중이고 DB와 앱은 `healthy`로 표시됩니다. 터미널을 닫아도 계속 실행되며 서버 재부팅 뒤 Docker와 컨테이너가 자동으로 시작됩니다.

## 13. 직원 PC에서 접속하기

**입력 장소: 폐쇄망에 연결된 직원 PC의 Chrome/Edge 주소창**

참가자 화면:

```text
http://실제서버IP
```

관리자 화면:

```text
http://실제서버IP/admin
```

예시 서버 IP가 10.20.30.40이라면 각각 `http://10.20.30.40`, `http://10.20.30.40/admin`입니다. 이 사이트는 내부 네트워크로 접속하므로 인터넷이 없어도 됩니다. 직원 PC에서 `localhost`를 입력하면 직원 PC 자신을 가리키므로 서버의 실제 주소를 사용해야 합니다.

관리자 로그인은 10단계에서 입력한 아이디·비밀번호를 사용합니다. **대회관리**에서 실제 행사 기간을 정하고, **문제은행**에서 50개 문제를 확인하세요. 기본 샘플 대회는 2026년 동안 열려 있습니다. 현재 날짜가 범위를 벗어나면 기간을 수정해야 참가 버튼이 활성화됩니다.

처음에는 테스트용 가상 참가자 정보로 확인하고 테스트 기록을 관리자에서 삭제하세요.

## 14. 실제 행사 전에 HTTPS 적용하기

HTTP는 초기 내부 작동 확인용입니다. 실제 이름·전화번호를 수집하는 행사에는 기관 내부 인증서로 HTTPS를 적용하세요. 인터넷 인증서 발급이 필수는 아니며 **기관 내부 CA 인증서**를 사용할 수 있습니다.

전산 담당자가 할 작업:

1. 내부 DNS 이름을 서버 IP에 연결합니다. 예: `quiz.intra.example`.
2. 직원 PC가 신뢰하는 내부 CA에서 해당 DNS 이름용 인증서와 개인키를 발급합니다.
3. `/opt/phishing-quiz-offline/nginx/tls/`에 `fullchain.pem`, `privkey.pem`을 배치합니다.
4. `nginx/https.conf.example`을 `nginx/default.conf` 대신 사용하도록 복사하고 `server_name`을 실제 내부 도메인으로 수정합니다.
5. `compose.offline.yaml`의 nginx ports에 `443:443`을 추가하고 다음 인증서 마운트를 추가합니다.

```yaml
- ./nginx/tls:/etc/nginx/tls:ro,Z
```

6. `.env`의 PUBLIC_URL을 실제 `https://내부도메인`으로 바꾸고 COOKIE_SECURE를 `true`로 설정합니다.
7. 승인된 방화벽 정책에서 HTTPS를 허용하고 재실행합니다.

```bash
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo bash scripts/offline/start.sh
```

인증서 오류가 없는지 직원 PC에서 확인합니다. `PUBLIC_URL`과 직원이 접속하는 주소가 다르면 답안 제출 등의 요청이 거절됩니다. 인증서의 개인키와 `.env`는 보호된 권한으로 관리하세요.

## 15. 평소 사용할 명령어

**입력 장소: 폐쇄망 물리 서버의 터미널**

```bash
cd /opt/phishing-quiz-offline
```

상태 확인:

```bash
sudo bash scripts/offline/status.sh
```

시작:

```bash
sudo bash scripts/offline/start.sh
```

정지 — 데이터는 지우지 않습니다:

```bash
sudo bash scripts/offline/stop.sh
```

최근 앱 오류 로그:

```bash
sudo docker compose -f compose.offline.yaml logs --tail=80 application
```

로그를 보내 도움을 요청할 때 `.env`, 비밀번호, 세션 쿠키, 참가자의 실제 개인정보는 함께 보내지 마세요.

## 16. 백업과 보유기간 정리

앱이 실행 중일 때:

```bash
cd /opt/phishing-quiz-offline
sudo bash scripts/offline/backup.sh
```

`backups/날짜시각/` 아래에 DB, 설정·비밀키, 업로드 이미지가 저장됩니다. 기관의 보호된 별도 백업 장소로 복사하세요. 운영 중 이미지가 변경되면 이미지 파일까지 일관된 백업이 필요한 시점에 잠시 참가를 중단하는 편이 좋습니다. 실제 운영 서버의 복원 절차는 담당자와 한 번 연습해야 합니다.

개인정보 보유기간이 지난 대회 데이터를 정리하는 명령:

```bash
sudo docker compose -f compose.offline.yaml exec -T application npm run privacy:purge
```

이 명령을 기관 스케줄러에서 매일 실행하도록 담당자가 설정해야 합니다. 보유기간 설정만으로 일정 작업이 자동 등록되는 것은 아닙니다.

`docker compose down -v` 또는 Docker 볼륨 삭제 명령은 DB 데이터를 지울 수 있으므로 평소 정지에는 사용하지 않습니다.

## 17. 오류가 나면 확인하기

| 상황 | 먼저 확인할 것 |
|---|---|
| docker: command not found | Docker 설치가 완료됐는지 |
| docker compose가 없다 | docker-compose-plugin RPM을 설치했는지 |
| permission denied / Docker socket 오류 | 이 문서처럼 sudo로 실행했는지 |
| image not found / pull 금지 오류 | load-images.sh 실행과 이미지 3개 존재 여부 |
| 포트 80 사용 중 | 기존 웹 서비스가 있는지 `sudo ss -ltnp`로 담당자와 확인 |
| 참가 페이지는 열리는데 등록/답변 오류 | .env의 PUBLIC_URL과 실제 접속 주소가 정확히 같은지 |
| 관리자 로그인 실패 | setup-env.sh에서 정한 아이디·비밀번호인지 |
| 직원 PC에서만 접속 불가 | 내부 네트워크, 고정 IP, 서버·기관 방화벽 |
| 앱 unhealthy | `logs --tail=80 application`에 나온 오류 |
| No space left on device | `df -h`로 디스크 여유 공간 |
| migration failed | 앱 로그 확인, DB가 이미 사용 중이면 초기화하지 말고 담당자와 복구 |

오류 화면에 비밀번호 입력 내용이 없어야 합니다. 읽을 수 있는 오류 문구와 실행한 단계 번호를 알려주면 원인을 좁힐 수 있습니다.

## 18. 프로그램을 나중에 수정한다면

`phishing-quiz-source.zip`이 수정용 원본입니다. 폐쇄망에서 수정한 파일을 서버 폴더에 덮어쓰는 것만으로 Docker 안의 프로그램이 바뀌지는 않습니다.

개발자가 인터넷 환경에서 소스 수정 → 의존성 설치 → 빌드 → 새 이미지 제작·검증 → docker save → 승인된 반입 → 폐쇄망에서 docker load → 앱 재생성을 진행합니다. 참가 데이터는 DB 볼륨에 보존하며 업데이트 전에 백업합니다. DB migration이 있으면 앱 시작 시 적용되므로 업데이트 버전의 변경 사항을 확인해야 합니다.

이번 설치에서는 **소스코드 빌드 단계가 이미 끝난 이미지**를 제공했으므로 5~13단계만 따라 실행할 수 있습니다.

## 19. 현재 제공 범위와 검증 범위

제공: 소스 ZIP, 앱·PostgreSQL·Nginx 이미지가 포함된 실행 꾸러미, 서버 주소·비밀번호 설정 도우미, 다운로드 없는 실행 설정, 이 설명서.

별도 준비: Rocky 설치 ISO(OS가 없는 경우), Rocky 버전에 맞는 Docker 설치 RPM·서명 키, 고정 IP·기관 방화벽·반입 승인, 실제 기관용 HTTPS 인증서.

앱은 Linux에서 자동 테스트 25개, Chromium 참가/관리자 흐름, 100개 동시 응시 시작·복원, Docker+Nginx HTTP 요청을 검증했습니다. 이 문서의 오프라인 실행 설정과 도우미로 새 DB를 생성하고, 관리자 로그인·50문제 제출·채점·재시작·백업을 클라우드에서 확인했습니다. **실제 Rocky 물리 서버와 반입용 Docker RPM의 설치는 아직 검증하지 않았으므로 해당 서버에서 최종 확인이 필요합니다.**
