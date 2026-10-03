# DWNC 멀티 스포츠 프로필 · 매칭

테니스·풋살·러닝의 프로필, 함께할 사람 찾기, 운동 기록과 구장 도장을 연결합니다. 기존 A 디자인과 모바일 UI를 유지하면서 이 작업 브랜치에는 실제 이메일 인증과 SQLite 서버 저장을 추가했습니다.

## 빠른 시작

Node.js **24.15 이상, 24.x**와 npm을 사용하세요.

이 데스크톱에는 Node 24.19.0과 npm이 사용자 PATH에 등록되어 있습니다. 설치 전부터 열린 터미널은 다시 여세요. `npm`을 찾지 못하면 [HANDOFF.md](HANDOFF.md)의 PATH 갱신 절차로 `node --version`과 `npm --version`부터 확인하세요.

```powershell
npm ci
npm start
```

**http://127.0.0.1:4174/#/home**에서 회원가입합니다. 서버는 로컬 `127.0.0.1`에만 바인딩합니다. 처음 의존성 설치 후에는 외부 DB나 API 없이 실행할 수 있습니다. 노트북 복제·두 계정 시연·검증 상세는 [HANDOFF.md](HANDOFF.md)에서 확인하세요.

브랜치 변경·업데이트 전에 실행한 서버는 종료하고 `npm start`로 다시 시작하세요. 화면은 열리지만 “기록을 불러오지 못했어요”가 표시되고 `/api/health`가 404라면 이전 정적 서버가 포트를 점유한 상태입니다. 해당 DWNC 서버를 실행한 터미널에서 `Ctrl+C`로 종료한 뒤 현재 프로젝트에서 다시 실행하세요. 정상 서버의 `/api/health`는 200과 `{"ok":true}`를 반환하며, 로그인 전 `/api/state`의 401은 정상입니다.

## 실제 사용자 흐름

- 회원가입·로그인·프로필 하단 로그아웃. 즐기는 스포츠, 사진, 지역·수준·소개 편집.
- 운동 모집 → 조건 검색 → 참여 신청 → 모집자 수락 → 참석·테니스 점수/풋살 MVP/러닝 거리·페이스 기록.
- 플레이 카드, 오늘 운동·한 줄 메모, 여권 형식 프로필과 장소 도장, 프로필/오늘 PNG.
- 친구 코드 신청·수락, 친구 운동 초대, 그룹 생성·가입·일정·기록, 앱 내 알림.
- 볼 수 있는 운동 기록을 기준으로 종목·지역별 랭킹. 타인의 비공개 장소·운동·결과는 서버에서 제외됩니다.

다른 계정은 시크릿 창이나 다른 브라우저에서 접속하세요. 상단 새로고침으로 다른 창의 신청·수락을 가져옵니다. 서버가 로그인한 사용자를 결정하므로 브라우저에서 다른 사람으로 전환하거나 전체 데이터를 덮어쓸 수 없습니다.

## DB · 인증 · 설정

기존 스택은 브라우저 ES 모듈 + Node HTTP 서버입니다. Better Auth **1.7.7**가 비밀번호 해시와 서버 세션을 담당하고, Node SQLite가 계정과 운동 데이터를 영속 저장합니다. Zod가 서버 입력을 검사합니다. Auth 데이터와 도메인 테이블은 하나의 로컬 DB에 있으며, 외래 키·트랜잭션·리비전 충돌·요청 ID 재사용 검사를 적용합니다.

```powershell
npm run db:migrate
# 선택 사항: 빈 로컬 DB에 허구 운동 예시만 넣습니다.
npm run db:seed
```

기본 `data/dwnc.sqlite`는 시작 시 자동으로 생성·마이그레이션됩니다. 시드는 기존 데이터가 있으면 거부합니다. 예시 프로필에는 로그인 계정이 없으므로 실제 계정 흐름은 직접 가입하여 시연합니다.

`.env.example`은 값 없는 템플릿입니다. `.env`가 없거나 값이 비면 로컬 기본 설정으로 실행합니다.

| 변수 | 용도 / 로컬 기본값 |
|---|---|
| `PORT` | 로컬 포트, 4174 |
| `DATABASE_PATH` | SQLite 파일, `data/dwnc.sqlite` |
| `BETTER_AUTH_URL` | 정확한 사이트 Origin, `http://127.0.0.1:4174` |
| `BETTER_AUTH_SECRET` | 선택적 로컬 인증 비밀값. 미설정 시 파일에 쓰지 않는 프로세스 전용 값 |
| `NODE_ENV` | 기본 개발 모드. production은 HTTPS와 32자 이상 비밀값 없으면 거부 |

기본 개발 모드에서는 서버 재시작 후 다시 로그인해야 합니다. 계정·운동 기록은 유지됩니다. `localhost`와 `127.0.0.1`을 섞지 마세요. 포트를 바꾸면 URL도 같은 포트로 지정하세요. 비밀값·DB를 Git에 넣지 마세요.

## API

| 경로 | 역할 |
|---|---|
| `/api/auth/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session` (모두 `/api/auth` 아래) | Better Auth 가입·로그인·로그아웃·세션 |
| `GET /api/state` | 인증 사용자에게 허용되는 화면 데이터, 리비전 |
| `POST /api/commands` | 검증된 프로필/운동/친구/그룹/알림 작업 |
| `GET /api/health` | 로컬 DB 연결 확인 |

명령 본문은 `{type, payload, revision, requestId, expectedUserId}`입니다. 예: `note.save`, `match.create`, `match.apply`, `match.decide`, `result.save`. 작업마다 허용 필드를 검사하고, 사용자 ID는 세션에서 가져옵니다. `expectedUserId`는 다른 탭에서 계정이 바뀌었는지 검사하는 값이며 권한을 부여하지 않습니다. 변경 요청은 사이트와 같은 `Origin`의 JSON 요청이어야 합니다. 리비전 충돌은 409로 반환합니다. 네트워크 재시도는 동일 요청 ID로 중복 생성을 막습니다.

## 검증 · 빌드

```powershell
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:build
```

- 문법 + 인증/API 경계 strict JS 타입검사 + **27개 도메인·서버/DB/마이그레이션 테스트** + 빌드.
- 실제 Chromium E2E **2개 시나리오**: 두 계정 가입·매칭·결과·재로그인, 수정·그룹·오류/재시도. 320/390/1280px의 8개 화면 확인.
- `npm run build`: 명시적으로 선택한 앱·백엔드 파일을 `dist/`에 복사. `npm run test:build`로 실제 산출물 시작을 확인합니다. 빌드와 배포는 별도입니다.

검증 결과·한계는 [HANDOFF.md](HANDOFF.md), 작업 소유권과 체크포인트는 [CURRENT-STATE.md](CURRENT-STATE.md)에 있습니다.

## 현재 범위

로컬 해커톤 MVP입니다. 이메일 소유 확인/메일/비밀번호 복구, 탈퇴·데이터 보존 정책, 외부 DB, 운영 배포, 운영 계정 및 실제 기기 검증은 포함하지 않았습니다. 외부 서비스·결제·제휴·추가 종목을 연결하지 않았습니다. 자유 가입 그룹과 운동 종료 전 결과 기록 같은 기존 MVP 규칙을 유지합니다.

이전 브라우저 `localStorage` 데모 기록은 보존하며 자동으로 서버에 업로드하지 않습니다. 기존 사용자 전환·초기화 데모는 과거 커밋 `c5f4de9`에 남아 있으며, 현재 `sport_passport_link`의 `main`과 `codex/dwnc-backend-auth`는 모두 실제 인증·SQLite 버전입니다. 디자인 초안은 [design-preview/README.md](design-preview/README.md), 기존 데모 발표 자료는 [HACKATHON-PREP.md](HACKATHON-PREP.md), 현재 실제 계정 시연은 [HANDOFF.md](HANDOFF.md)를 참고하세요.

공식 기술 근거: [Better Auth 설치](https://better-auth.com/docs/installation), [SQLite 연결](https://better-auth.com/docs/adapters/sqlite), [이메일·비밀번호](https://better-auth.com/docs/authentication/email-password). 설치된 1.7.7의 export와 타입을 확인하여 Node SQLite 및 마이그레이션 API를 적용했습니다.
