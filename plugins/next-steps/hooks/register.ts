import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { NextSteps } from '../types'

const RULES = `# Next-steps
작업 단위를 끝낼 때 응답 마지막에 \`다음 단계\` 제목을 두고 체크박스(\`- [ ] \`) 2~3개로 제안한다. 단순 질의응답에는 붙이지 않는다.
- 코드 작업: 아직 하지 않은 검증(빌드, 테스트, 실제 실행 확인), 영향받는 다른 모듈·호출부, 관련 이슈·PR. 이슈·PR 번호는 대화나 브랜치명에서 확인된 것만 쓰고 지어내지 않는다.
- 문서 작업: 미확정 수치·출처, 검토자가 확인해야 할 항목, 다음에 쓸 절.
- 각 항목은 바로 실행할 수 있는 한 줄로 쓴다. 가장 권장하는 항목을 맨 위에 둔다.`

const items = atom({ plugin: 'next-steps', key: 'items' } as const, [])

/** 응답에서 "다음 단계" 제목 아래의 체크박스 항목을 뽑는다. */
export const parse = (answer: string): NextSteps => {
  const at = answer.lastIndexOf('다음 단계')

  if (at === -1) {
    return []
  }

  return answer
    .slice(at)
    .split('\n')
    .map(line => /^\s*[-*]\s*\[ \]\s*(.+)$/.exec(line)?.[1]?.trim())
    .filter((one): one is string => one !== undefined && one !== '')
    .slice(0, 5)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'next',
      description: '마지막으로 제안된 다음 단계를 보거나, 번호를 주면 입력창에 넣는다',
      argumentHint: '[번호]',
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'next-steps:rules', text: RULES, scope: 'session' },
      ],
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined && e.reason === 'answer') {
      const found = parse(e.answer)
      await update($, items, () => found)
      const first = found[0]

      if (first !== undefined) {
        // 턴이 끝난 뒤 빈 입력창에 흐리게 제안한다. Tab으로 받는다.
        $.clock.after(500, () => {
          void $.prompt.suggest({ text: first }).catch(() => undefined)
        })
      }
    }

    return done
  })

  on('command.run', { command: 'next' }, async ($, e) => {
    const list = await read($, items)

    if (list.length === 0) {
      return { text: '제안된 다음 단계가 없습니다.' }
    }

    const picked = list[Number(e.args.trim()) - 1]

    if (picked === undefined) {
      const lines = list.map((one, i) => `${i + 1}. ${one}`).join('\n')

      return { text: `다음 단계 (/next <번호>로 입력창에 넣기)\n${lines}` }
    }

    await $.prompt.fill({ text: picked, mode: 'replace' })

    return { text: `입력창에 넣었습니다: ${picked}` }
  })
}
