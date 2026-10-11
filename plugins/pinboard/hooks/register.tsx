import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pin } from '../types'

// plan-board 패널이 .claude/pinboard.md 를 읽어 핀을 보여준다. 프롬프트 위 영역은 usage-hud 가 쓴다.
const pins = atom({ plugin: 'pinboard', key: 'pins' } as const, [])
const LINE = /^- \[(결정|할일)\] (\d{4}-\d{2}-\d{2}) (.+)$/
const HEAD = '# Pinboard\n\n/pin, /unpin 으로 관리한다. 한 줄에 핀 하나.\n\n'

const RULES = `# Pinboard
- 아래 핀은 사용자가 고정한 결정 사항과 진행 중인 할 일이다. 요청이 핀의 결정과 충돌하면 진행하기 전에 해당 핀을 인용해 알린다.
- 사용자가 무언가를 확정하면("이걸로 가자", "결정" 등) \`/pin <내용>\`으로 기록할지 한 줄로 제안한다. 핀 파일을 직접 고치지 않는다.`

export const parse = (text: string): Pin[] =>
  text.split('\n').flatMap(line => {
    const found = LINE.exec(line.trim())

    return found === null
      ? []
      : [{ kind: found[1] as Pin['kind'], date: found[2] ?? '', text: found[3] ?? '' }]
  })

export const format = (list: readonly Pin[]): string =>
  HEAD + list.map(pin => `- [${pin.kind}] ${pin.date} ${pin.text}`).join('\n') + '\n'

const file = async ($: EngineInterface) => `${await $.session.root()}/.claude/pinboard.md`

const load = async ($: EngineInterface): Promise<Pin[]> => {
  try {
    return parse(await $.fs.read(await file($)))
  } catch {
    return []
  }
}

const save = async ($: EngineInterface, list: Pin[]) => {
  await $.fs.write(await file($), format(list))
  await update($, pins, () => list)
}

// 한국 시간 기준 날짜
const today = async ($: EngineInterface) =>
  new Date((await $.clock.now()) + 9 * 3_600_000).toISOString().slice(0, 10)

const listing = (list: readonly Pin[]) =>
  list.map((pin, i) => `${i + 1}. [${pin.kind}] ${pin.text} (${pin.date})`).join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pin',
      description: '결정 사항을 고정한다. "할일:"로 시작하면 진행 중 할 일로 고정',
      argumentHint: '[할일:] <내용>',
    })
    await $.command.register({
      name: 'unpin',
      description: '번호의 핀을 내린다 (끝난 할 일, 바뀐 결정)',
      argumentHint: '<번호>',
    })
    await $.command.register({ name: 'pins', description: '고정된 핀 목록 보기' })
    await update($, pins, await load($).then(list => () => list))

    return next(e)
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const raw = e.args.trim()
    const isTodo = /^(할일|todo)\s*[:：]/i.test(raw)
    const text = raw.replace(/^(할일|todo|결정)\s*[:：]\s*/i, '').replace(/\s+/g, ' ')

    if (text === '') {
      return { text: '사용법: /pin <결정 내용>  또는  /pin 할일: <내용>' }
    }

    const list = [...(await load($)), { kind: isTodo ? '할일' : '결정', date: await today($), text } as Pin]
    await save($, list)

    return { text: `고정했습니다.\n${listing(list)}` }
  })

  on('command.run', { command: 'unpin' }, async ($, e) => {
    const list = await load($)
    const at = Number(e.args.trim()) - 1
    const gone = list[at]

    if (gone === undefined) {
      return { text: `사용법: /unpin <번호>\n${listing(list) || '고정된 핀이 없습니다.'}` }
    }

    await save($, list.filter((_, i) => i !== at))

    return { text: `내렸습니다: [${gone.kind}] ${gone.text}` }
  })

  on('command.run', { command: 'pins' }, async $ => {
    const list = await load($)
    await update($, pins, () => list)

    return { text: listing(list) || '고정된 핀이 없습니다. /pin <내용>으로 추가하세요.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const list = await load($)
    const text = `${RULES}\n\n현재 핀:\n${listing(list) || '(없음)'}`

    return {
      sections: [...composed.sections, { id: 'pinboard:pins', text, scope: 'session' }],
    }
  })
}
