import { expect, test } from 'claude-code/testing'

test('next-steps: 시스템 프롬프트에 규칙 절을 덧붙인다', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })

  expect(sections.map(one => one.id)).toEqual(['intro', 'next-steps:rules'])
  expect(sections.at(-1)?.scope).toBe('session')
})
