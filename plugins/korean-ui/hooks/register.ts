import type { Register } from 'claude-code'

const RULES = `# 응답 언어와 형식
- 응답, 요약, 질문, 커밋 메시지·PR 설명 초안은 한국어로 작성한다. 코드 식별자, 명령어, 로그, 오류 메시지는 원문을 유지한다.
- 결론을 먼저 쓰고 필요한 경우에만 부연한다. 서두와 수식어는 생략한다.
- 확인한 사실, 추정, 모르는 것을 구분해서 쓴다. 확인하지 않은 것을 확인한 것처럼 쓰지 않는다.`

/** 기본 슬래시 명령의 한국어 설명. 여기 없는 명령은 원문 그대로 둔다. */
export const KO: Record<string, string> = {
  help: '도움말과 사용 가능한 명령 보기',
  clear: '대화 기록을 지우고 새로 시작',
  compact: '대화를 요약해 컨텍스트 확보 (뒤에 요약 지침을 쓸 수 있음)',
  config: '설정 열기',
  context: '컨텍스트 사용량 보기',
  cost: '이번 세션의 비용과 사용 시간 보기',
  usage: '요금제 사용 한도 보기',
  model: '사용할 모델 선택',
  resume: '이전 대화 이어서 하기',
  rewind: '대화나 코드를 이전 시점으로 되돌리기',
  memory: '메모리 파일(CLAUDE.md) 편집',
  init: '코드베이스를 분석해 CLAUDE.md 초기화',
  review: '변경 사항 코드 리뷰',
  mcp: 'MCP 서버 관리',
  permissions: '도구 허용·거부 규칙 관리',
  hooks: '훅 설정 관리',
  agents: '서브에이전트 관리',
  plugin: '플러그인 관리',
  status: '버전, 모델, 계정, 연결 상태 보기',
  doctor: '설치 상태 진단',
  export: '대화를 파일이나 클립보드로 내보내기',
  login: '계정 로그인',
  logout: '계정 로그아웃',
  exit: '종료',
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'korean-ui:rules', text: RULES, scope: 'session' },
      ],
    }
  })

  on('command.describe', async ($, e, next) => {
    const described = await next(e)
    const ko = KO[e.command]

    return ko === undefined ? described : { ...described, description: ko }
  })
}
