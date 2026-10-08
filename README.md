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

## 개발

```
claude --plugin-dir ./usage-hud      # 이 폴더에서 바로 로드
claude plugin validate .
claude plugin test .
```

## License

MIT
