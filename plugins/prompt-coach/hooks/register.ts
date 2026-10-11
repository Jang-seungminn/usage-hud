import type { Register } from 'claude-code'

const RULES = `# Prompt-coach
요청을 실행하기 전에 아래 항목을 점검한다. 불명확하고, 잘못 추측했을 때 되돌리는 비용이 크면 실행하지 말고 질문한다(최대 3개, 선택지 형태).
- 대상: 어느 저장소·모듈·파일인가, 또는 어느 문서의 어느 절인가
- 완료 기준: 무엇이 되면 끝인가 (빌드 통과, 테스트 추가, 분량, 양식)
- 제약: 바꾸면 안 되는 것(공개 인터페이스, 의존 방향, 기존 동작), 따라야 할 컨벤션·문서 양식·용어
불명확하지만 되돌리기 쉬우면 질문하지 말고, 가정을 첫 줄에 한 문장으로 밝히고 진행한다.`

const COACH = `너는 프롬프트 편집자다. 사용자의 요청을 실행하지 말고, 코딩 에이전트에게 그대로 보낼 수 있는 명확한 요청으로 다듬는다.
요청은 코드 작업일 수도, 문서 작업일 수도 있다. 언어·프레임워크는 요청과 대화에 드러난 것만 쓴다.
다듬은 요청에는 대상(저장소·모듈·파일 또는 문서의 절), 완료 기준(빌드·테스트 통과, 분량, 양식 등), 제약을 담는다. 사용자가 말하지 않은 사실을 지어내지 말고, 모르는 부분은 [확인 필요: ...]로 남긴다.
아래 형식만 출력한다.
<<<요청>>>
(다듬은 요청)
<<<메모>>>
- 가정: (채워 넣은 내용, 없으면 "없음")
- 확인 필요: (추정으로 채울 수 없는 항목, 최대 3개, 없으면 "없음")`

export const split = (reply: string): { prompt: string; notes: string } => {
  const [head = '', notes = ''] = reply.split('<<<메모>>>')

  return { prompt: head.replace('<<<요청>>>', '').trim(), notes: notes.trim() }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'coach',
      description: '요청을 실행하지 않고 더 명확한 프롬프트로 다듬어 입력창에 넣는다',
      argumentHint: '<다듬을 요청>',
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'prompt-coach:rules', text: RULES, scope: 'session' },
      ],
    }
  })

  on('command.run', { command: 'coach' }, async ($, e) => {
    const draft = e.args.trim() || (await $.prompt.read()).text.trim()

    if (draft === '') {
      return { text: '사용법: /coach <다듬을 요청>' }
    }

    const reply = await $.model.complete({
      model: await $.session.model(),
      system: COACH,
      prompt: draft,
      maxTokens: 1500,
    })

    if (!reply.isAnswered) {
      return { text: `다듬지 못했습니다 (${reply.reason}). 원래 요청은 그대로입니다.` }
    }

    const { prompt, notes } = split(reply.text)

    if (prompt === '') {
      return { text: `다듬은 결과를 읽지 못했습니다. 모델 응답:\n${reply.text}` }
    }

    await $.prompt.fill({ text: prompt, mode: 'replace' })

    return {
      text: `다듬은 요청을 입력창에 넣었습니다. 확인·수정 후 Enter로 보내세요.\n${notes}`,
    }
  })
}
