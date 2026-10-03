# 홈 콩 캐릭터 연결 안내

2026-10-03 사용자 요청에 따른 로컬 홈 시안입니다. 팀원이 만드는 실제 콩 캐릭터와 성장 로직이 최종 원본입니다. 이 시안은 성장 공식이나 캐릭터 저장 모델을 별도로 만들지 않습니다.

## main 병합 시 연결할 부분

`dwnc-app/home-character.js`의 `registerHomeCharacterProvider`에 팀원 구현을 연결합니다. 홈의 앞면 원형 이미지와 뒷면 성장 카드가 동일한 공급자를 사용합니다.

```js
import { registerHomeCharacterProvider } from './home-character.js';

// app.js 초기화에서 팀원의 실제 조회 함수를 사용해 등록합니다.
registerHomeCharacterProvider((state, userId) => {
  const kong = getTeamCharacter(state, userId);
  return {
    nickname: kong.nickname,
    imageUrl: kong.imageUrl,
    levels: {
      tennis: kong.racketLevel,
      futsal: kong.ballLevel,
      running: kong.shoesLevel,
    },
  };
});
```

`getTeamCharacter`는 예시 계약이며 실제 함수/필드명은 병합할 팀원 코드에 맞춥니다. 등록하지 않거나 조회가 실패하면 임시 콩과 ‘준비 중’을 표시합니다. 장비 레벨은 1 이상의 정수만 받으며 임의로 운동 횟수에서 계산하지 않습니다.

- 이미지: `./assets/파일명.png|webp|jpg|svg` 또는 PNG/JPEG/WebP data URI. 실제 이미지 파일을 추가하면 `server.js`의 명시적 정적 파일 목록, MIME 타입과 `scripts/build.mjs`의 파일 목록에도 추가합니다. 허용된 경로만 제공하며 외부 URL은 받지 않습니다.
- 원형 이미지: 기존 `person.photo`를 재사용합니다. 사진 업로드도 기존 `profile.photo` 명령을 사용합니다. 사진/콩 표시 선택은 `dwnc.home.avatar.v1:<사용자 ID>`라는 브라우저별 설정이며 캐릭터의 성장 상태를 수정하지 않습니다. 팀원 구현에 공용 아바타 선택 필드가 생기면 `homeAvatarMode`/`setHomeAvatarMode` 두 함수를 그 설정으로 교체합니다.
- 닉네임: 공급자의 `nickname`을 표시하며, 없으면 ‘콩식이’를 사용합니다. 왼쪽 위 연필 버튼으로 1~16자 이름을 설정할 수 있습니다. 현재 로컬 시안은 `dwnc.home.kong-name.v1:<사용자 ID>`에 브라우저별로 저장하며 기존 사용자 이름과 분리합니다. main의 실제 닉네임 저장 명령이 준비되면 `homeKongNickname`/`setHomeKongNickname`과 `home-kong-name-form`의 저장을 그 명령으로 연결하고 로컬 설정의 이전 여부를 결정합니다. 공급자와 입력 양쪽에 같은 이름 검증을 적용합니다.
- 최근 30일: 오늘 포함 30개 달력 날짜, 운동의 `match.date` 기준. 완료 결과에 본인이 참석자로 포함된 운동만 종목별로 집계합니다. 미래/취소/미완료/불참/중복 결과는 제외합니다. 운동 횟수이므로 참석한 테니스 경기 미성립 기록도 한 번으로 셉니다. 장비 레벨과 독립적입니다.
- 홈 카드: `rotateX(180deg)`로 뒤집고 보이지 않는 면에는 `inert`와 `aria-hidden`을 적용합니다. 카드의 빈 영역과 ‘콩 성장 보기’ 버튼이 뒤집기를 수행합니다. 사진 변경과 프로필 이동은 별도 동작이며, 모션 감소 설정에서는 즉시 전환합니다.
- 성장 화면: 캐릭터를 중앙에, 닉네임을 왼쪽 위에, 라켓/축구공/러닝화 슬롯을 오른쪽 위에 배치합니다. 최근 30일 종목별 횟수는 오른쪽 아래에 별도 패널 없이 표시합니다. 앞면 프로필이 카드 높이를 결정하고, 뒷면은 그 크기에 맞춰 겹쳐 배치합니다. 모바일 콩은 190px, 넓은 화면에서는 220px로 줄여 뒤집을 때 카드와 아래 버튼의 위치가 변하지 않습니다. 이름 편집은 카드 뒤집기를 발생시키지 않습니다.
- 상세 정보: 뒷면 ‘프로필에서 자세히 보기’는 기존 `#/profile`로 이동합니다. 상세 콩 화면은 팀원 구현을 이 경로에 병합할 때 연결합니다.

## 임시 이미지

- 파일: `dwnc-app/assets/kong-preview-v1.png` (원본 투명 PNG)
- 생성: 내장 imagegen 도구, `illustration-story`, 2026-10-03.
- 생성 프롬프트 원문: [kong-preview-v1.prompt.md](dwnc-app/assets/kong-preview-v1.prompt.md).

최종 캐릭터가 들어오면 공급자에 실제 이미지를 지정합니다. 임시 이미지의 파일 이름을 덮어쓰기보다 공급자를 연결해 시안과 최종 버전을 구분합니다.

## 확인

`npm run check`, `npm run test:e2e`, `npm run test:build`를 실행합니다. 단위 테스트는 30일 경계/출석/중복, 공급자의 이미지·레벨·닉네임 교체와 이름 검증을 확인합니다. 브라우저 테스트는 닉네임 저장/공백 거부/문자 이스케이프/새로고침·재로그인 유지, 사진 업로드/선택 유지, 뒤집기/상세 이동, 실제 기록 후 운동 횟수와 320/390/402/1280px 앞뒤 카드의 동일한 크기·아래 버튼 위치 및 가로 넘침을 확인합니다.
