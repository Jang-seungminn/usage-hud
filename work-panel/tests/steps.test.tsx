import { expect, test } from 'claude-code/testing'

import { nextSteps } from '../hooks/register'

test('work-panel: 응답에서 다음 단계를 읽는다', async () => {
  expect(nextSteps('끝.\n\n다음 단계\n- [ ] 실기 확인')).toEqual(['실기 확인'])
})

test('work-panel: 상태가 없어도 패널을 그린다', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'work-panel',
      surface,
      component: 'Pane',
      requestId: 'work-panel',
      props: { title: '작업 패널' } as never,
    })

    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    await ui.unmount()
  }
})
