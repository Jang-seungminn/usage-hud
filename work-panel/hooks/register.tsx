import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const PANE = 'work-panel'
const TITLE = '작업 패널'
const snapshot = atom({ plugin: 'work-panel', key: 'snapshot' } as const, null)

// 한국 시간 기준
const kst = (ms: number) =>
  new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')

const readOr = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

const bullets = (text: string) =>
  text
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())

/** 응답에서 "다음 단계" 아래의 체크박스 항목을 뽑는다. */
export const nextSteps = (answer: string): string[] => {
  const at = answer.lastIndexOf('다음 단계')

  return at === -1
    ? []
    : answer
        .slice(at)
        .split('\n')
        .map(line => /^\s*[-*]\s*\[ \]\s*(.+)$/.exec(line)?.[1]?.trim())
        .filter((one): one is string => one !== undefined && one !== '')
        .slice(0, 5)
}

const refresh = async ($: EngineInterface, next?: string[]) => {
  const base = `${await $.session.root()}/.claude`
  const usage = await $.session.usage()
  const handoff = await $.fs.stat(`${base}/handoff/HANDOFF.md`).catch(() => undefined)
  const before = await read($, snapshot)
  const taken: Snapshot = {
    at: kst(await $.clock.now()),
    model: await $.session.model(),
    percent: usage.context.percent ?? null,
    usd: usage.cost?.usd ?? null,
    pins: bullets(await readOr($, `${base}/pinboard.md`)),
    next: next ?? before?.next ?? [],
    handoff: handoff === undefined ? null : kst(handoff.mtimeMs),
    notes: bullets(await readOr($, `${base}/handoff/NOTES.md`)).length,
  }
  await update($, snapshot, () => taken)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'panel',
      description: '작업 패널 열기: 세션 상태, 핀, 다음 단계, 인수인계',
    })
    await refresh($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'panel' }, async $ => {
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return {
      text: opened.isPlaced
        ? '작업 패널을 열었습니다.'
        : '작업 패널을 열었지만 지금 화면에서는 그려지지 않습니다. 창을 넓혀 보세요.',
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      const found = nextSteps(e.answer)
      await refresh($, found.length > 0 ? found : undefined).catch(() => undefined)
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await read($, snapshot)

    if (now === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>아직 읽은 상태가 없습니다.</Text>
          <Button key="refresh" label="새로고침" onPress={() => refresh($)} />
        </Box>
      )
    }

    const context = now.percent === null ? '측정 전' : `${now.percent}%`
    const cost = now.usd === null ? '' : ` · $${now.usd.toFixed(2)}`

    return (
      <Box flexDirection="column">
        <Text bold>세션</Text>
        <Text>{now.model}</Text>
        <Text color={(now.percent ?? 0) >= 70 ? 'yellow' : undefined}>
          컨텍스트 {context}
          {cost}
        </Text>
        <Text> </Text>
        <Text bold>핀 ({now.pins.length})</Text>
        {now.pins.length === 0 && <Text dimColor>없음 · /pin 내용</Text>}
        {now.pins.map(pin => (
          <Text>· {pin}</Text>
        ))}
        <Text> </Text>
        <Text bold>다음 단계</Text>
        {now.next.length === 0 && <Text dimColor>제안된 항목 없음</Text>}
        {now.next.map((one, i) => (
          <Text>
            {i + 1}. {one}
          </Text>
        ))}
        <Text> </Text>
        <Text bold>인수인계</Text>
        <Text dimColor={now.handoff === null}>
          {now.handoff === null ? '없음 · /handoff' : `작성 ${now.handoff} · /pickup`}
        </Text>
        <Text dimColor>수동 메모 {now.notes}개 · /note 내용</Text>
        <Text> </Text>
        <Button key="refresh" label="새로고침" onPress={() => refresh($)} />
        <Text dimColor>갱신 {now.at}</Text>
      </Box>
    )
  })
}
