import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { WarnedAt } from '../types'

/** 컨텍스트 사용률이 이 값(%)을 넘으면 /handoff 를 권한다. 이후 STEP %p 오를 때마다 다시 알린다. */
export const WARN_AT: WarnedAt = 70
// usage-hud 가 80%에서 알리므로 70%, 90%에 알려 겹치지 않게 한다.
export const STEP = 20

const warnedAt = atom({ plugin: 'auto-handoff', key: 'warnedAt' } as const, 0)

const RULES = `# Auto-handoff
- 큰 작업 단위가 끝났거나 사용자가 마무리 의사를 보이면 \`/handoff\` 실행을 한 줄로 제안한다.
- 인수인계서는 \`.claude/handoff/HANDOFF.md\`, 수동 메모는 \`.claude/handoff/NOTES.md\`에 있다. 사용자가 이어서 하자고 하면 먼저 읽는다.`

const ASK = `지금까지의 대화를 새 세션이 이어받을 수 있도록 인수인계서를 한국어 마크다운으로 작성한다. 도구는 쓰지 않는다. 대화에서 확인된 사실만 쓰고, 추정은 "(추정)"으로 표시하며, 모르는 것은 지어내지 않는다. 코드 식별자·경로·명령은 원문 그대로 쓴다. 아래 제목을 그대로 쓰고, 해당 없는 절은 "없음"으로 둔다.

## 목표
## 완료한 것
## 결정 사항 (이유 포함)
## 진행 중인 것 (현재 상태, 멈춘 지점)
## 다음 단계 (우선순위 순, 체크박스)
## 관련 파일·명령
## 미해결 문제·주의사항`

const dir = async ($: EngineInterface) => `${await $.session.root()}/.claude/handoff`

// 한국 시간 기준
const stamp = async ($: EngineInterface) =>
  new Date((await $.clock.now()) + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')

const readOr = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: '지금까지의 대화를 인수인계서(.claude/handoff/HANDOFF.md)로 정리한다',
      argumentHint: '[강조할 내용]',
    })
    await $.command.register({
      name: 'pickup',
      description: '인수인계서를 읽고 이전 작업을 이어받는다',
    })
    await $.command.register({
      name: 'note',
      description: '인수인계에 포함할 메모를 직접 남긴다 (.claude/handoff/NOTES.md)',
      argumentHint: '<메모>',
    })

    if (e.isInteractive && (await $.fs.exists(`${await dir($)}/HANDOFF.md`))) {
      $.ui.toast('인수인계서가 있습니다. /pickup 으로 이어받을 수 있습니다.')
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'auto-handoff:rules', text: RULES, scope: 'session' },
      ],
    }
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    const text = e.args.trim()

    if (text === '') {
      return { text: '사용법: /note <메모>' }
    }

    const path = `${await dir($)}/NOTES.md`
    const before = await readOr($, path)
    await $.fs.write(path, `${before || '# 수동 메모\n\n'}- ${await stamp($)} ${text}\n`)

    return { text: `메모했습니다: ${text}` }
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    const base = await dir($)
    const notes = await readOr($, `${base}/NOTES.md`)
    const stress = e.args.trim()
    const reply = await $.model.fork({
      prompt: [
        ASK,
        stress && `특히 다음을 빠뜨리지 않는다: ${stress}`,
        notes && `사용자가 남긴 수동 메모(그대로 반영):\n${notes}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    })

    if (!reply.isAnswered) {
      return {
        text:
          reply.reason === 'nothing-to-fork'
            ? '아직 정리할 대화가 없습니다.'
            : `인수인계서를 만들지 못했습니다 (${reply.reason}).`,
      }
    }

    const when = await stamp($)
    const body = `# 인수인계서\n\n작성: ${when} (KST)\n\n${reply.text.trim()}\n`
    await $.fs.write(`${base}/HANDOFF.md`, body)
    await $.fs.write(`${base}/archive/${when.replace(/[: ]/g, '-')}.md`, body)
    await update($, warnedAt, () => 0)

    return {
      text: `인수인계서를 저장했습니다: .claude/handoff/HANDOFF.md\n새 세션에서 /pickup 으로 이어받으세요.`,
    }
  })

  on('command.run', { command: 'pickup' }, async $ => {
    if (!(await $.fs.exists(`${await dir($)}/HANDOFF.md`))) {
      return { text: '인수인계서가 없습니다. 이전 세션에서 /handoff 를 먼저 실행하세요.' }
    }

    void $.prompt.submit({
      text: '.claude/handoff/HANDOFF.md 를 읽고(있으면 .claude/handoff/NOTES.md 도), 현재 상태를 5줄 이내로 요약한 뒤 "다음 단계"의 첫 항목부터 이어서 진행할지 물어봐. 문서 내용과 실제 파일 상태가 다르면 먼저 알려줘.',
      asUser: true,
    })

    return { text: '인수인계서를 읽어 이어받습니다.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      const percent = (await $.session.usage()).context.percent ?? 0
      const last = await read($, warnedAt)

      if (percent >= WARN_AT && percent >= last + STEP) {
        await update($, warnedAt, () => percent)
        $.ui.toast(`컨텍스트 ${percent}% 사용. /handoff 로 정리하고 새 세션에서 이어가는 것을 권합니다.`)
      }
    }

    return done
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)

    if (e.trigger === 'auto' && e.agentId === undefined) {
      $.ui.toast('대화가 자동 압축되었습니다. 세부 맥락이 줄었으니 /handoff 를 권합니다.')
    }

    return compacted
  }).catch(($, e, next) => next(e))
}
