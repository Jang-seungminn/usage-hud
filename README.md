# usage-hud

A Claude Code mod that draws a usage HUD above the prompt. Two ASCII dogs keep an eye on your limits.

Claude Code 프롬프트 위에 사용량 HUD를 그려주는 mod입니다. 강아지 두 마리가 한도를 지켜봅니다.

```
    __                5h ████░░░░ 13%       / \__              7d █████░░░ 64%      ctx ██░░░░░░ 23% 226k/1.0M
 o-''|\_____/)          ↻ 40m                 (    @\___           ↻ 17h40m           last 1m54s · tools 13   +$0.80 2.2M↑ 10k↓
  \_/|_)     )          “공 물어올게”          /         O          “장부 정리 중”      cache 99%
     \  __  /                                /   (_____/                              Opus 5.5 · medium   AUTO   $7.06   ⎇ main ✓
     (_/ (_/                                 /_____/   U
```

## 설치

Claude Code 터미널 세션의 프롬프트에서 다음을 입력합니다.

```
/plugin install usage-hud --marketplace Jang-seungminn/usage-hud
```

`Add marketplace?`에 `y`를 입력하고, scope를 고릅니다. 모든 세션에서 쓰려면 user scope를 선택합니다. 설치한 세션에서 바로 동작합니다.

같은 marketplace에 진행 상황 패널 [plan-board](#plan-board)도 있습니다.

```
/plugin install plan-board --marketplace Jang-seungminn/usage-hud
```

## 보여주는 것

| 항목 | 내용 |
|---|---|
| 5h / 7d | 사용 한도 게이지, 리셋까지 남은 시간, 리셋 전에 한도가 바닥날 것 같으면 `⚡N 후 소진` |
| ctx | context window 사용량 |
| 턴 | 진행 중에는 경과 시간과 도구 호출 수, 끝난 뒤에는 그 턴의 비용과 입출력 토큰 |
| cache | 마지막 응답의 prompt cache 적중률 |
| 세션 | 모델 · effort, 권한 모드 배지, 누적 비용 |
| git | 브랜치, ahead/behind, staged/수정/추적 안 된 파일 수 |
| agents / bg | 실행 중인 서브에이전트와 백그라운드 작업 수 |

알림(toast):

- context가 80%를 넘거나 사용 한도가 90%를 넘는 순간
- 50% 넘게 쓴 한도가 리셋될 때

## 강아지

- **5h 강아지(전신):** 5시간 한도와 context를 지켜봅니다.
- **7d 강아지(얼굴):** 7일 한도를 지켜봅니다.

수치에 따라 상태가 바뀝니다.

| 상태 | 조건 |
|---|---|
| 여유 | 기본 |
| 작업 중 | Claude가 일하는 동안 |
| 완료 | 턴이 끝나고 20초 동안 |
| 진땀 | 50% 이상 |
| 패닉 | 80% 이상 |
| 소진 | 100% |
| 수면 | 10분 넘게 쉬는 중 |

`/hud`를 입력하면 강아지를 끄고 켭니다. 강아지는 band가 5줄을 쓸 수 있을 때만 나오고, 터미널이 130칸 이상이면 모든 정보가 한 줄로 나란히 배치됩니다.

## 참고

- 사용 한도(5h/7d)는 Claude 구독 계정에서만 표시됩니다.
- 권한 모드 배지는 다음 프롬프트나 도구 실행 때 갱신됩니다.

## plan-board

사이드 패널(fullscreen에서는 transcript 옆, 아니면 프롬프트 위)에 이 세션이 **무엇을 하려는지**와 **어디까지 왔는지**를 보여줍니다. 보여줄 것이 처음 생길 때 패널이 한 번 열리고, 닫은 뒤에는 `/board`로 다시 엽니다.

```
◎ 목표
GitHub 로그인 붙이기
plan Users can sign in with GitHub.
/goal bun test exits 0

▤ 플랜 2026-10-11-auth.md
plan  Auth Feature Implementation Plan
task  ██████░░░░░░ 1/3
step  ██████████░░ 3/5
▶ Task 2: Session cookie
  ✓ Step 1: Write the failing test
  ○ Step 2: Implement setCookie
○ Task 3: Logout

☰ 작업 ████░░░░ 1/2
▶ Writing plan
✓ Write spec

⚙ 에이전트 실행 1 · 완료 2
● Explore auth code [Explore] 1m05s
✓ Review spec 42s
```

| 영역 | 어디서 오나 |
|---|---|
| 목표 | `/mission <목표>`로 정한 목표. 없으면 세션의 첫 프롬프트. 플랜 파일의 `**Goal:**` 줄, 내장 `/goal`(또는 ProposeGoal)의 완료 조건도 함께 |
| 플랜 | `…/plans/*.md` 파일을 Write/Edit 하면 읽어서, 체크박스가 있는 제목(`### Task N: …`)을 작업으로, 체크박스를 단계로 셉니다. 매 턴이 끝날 때 다시 읽으므로 sed 등으로 체크해도 반영됩니다. superpowers의 `docs/superpowers/plans/`, `docs/plans/` 모두 해당 |
| spec | `…/specs/*.md` 또는 `*-design.md`를 쓰면 제목을 표시 |
| 작업 / 할 일 | TaskCreate·TaskUpdate·TaskList, TodoWrite. 진행 중 → 대기 → 완료 순으로, 완료는 최근 3개만 |
| 에이전트 | Agent 호출과 SubagentStart/Stop. 실행 중인 것은 경과 시간, 끝난 것은 최근 3개 |

명령:

- `/board` 패널 열기, `/board clear` 작업·플랜·에이전트 목록 비우기
- `/mission <목표>` 목표 정하기, `/mission` 현재 목표 보기, `/mission clear` 지우기

## 개발

두 mod는 `plugins/` 아래 각자의 폴더에 있고, 저장소 루트는 marketplace입니다.

```
claude --plugin-dir ./plugins/usage-hud --plugin-dir ./plugins/plan-board
claude plugin validate .                     # marketplace
claude plugin validate plugins/plan-board
claude plugin test plugins/usage-hud
claude plugin test plugins/plan-board
```

## License

MIT
