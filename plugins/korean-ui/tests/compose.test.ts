import { expect, test } from 'claude-code/testing'

test('korean-ui: 시스템 프롬프트에 규칙 절을 덧붙인다', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })

  expect(sections.map(one => one.id)).toEqual(['intro', 'korean-ui:rules'])
  expect(sections.at(-1)?.scope).toBe('session')
})

test('korean-ui: 기본 명령 설명을 한국어로 바꾸고 모르는 명령은 그대로 둔다', async ($, on) => {
  on('command.describe', (_, e) => ({ description: e.description, isHidden: false }))
  const base = { isHidden: false, immediate: false } as never as { isHidden: boolean }
  const known = await $.command.describe({ ...base, command: 'compact', description: 'Compact' } as never)
  const other = await $.command.describe({ ...base, command: 'zzz', description: 'Other' } as never)

  expect(known.description).toContain('요약')
  expect(other.description).toBe('Other')
})
