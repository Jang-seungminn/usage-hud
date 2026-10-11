import { expect, test } from 'claude-code/testing'

import { format, parse } from '../hooks/register'

const FILE = format([
  { kind: '결정', date: '2026-10-10', text: 'DI는 생성자 주입만' },
  { kind: '할일', date: '2026-10-10', text: 'MR 리뷰 반영' },
])

test('pinboard: 파일 형식을 왕복한다', async () => {
  expect(parse(FILE).map(pin => pin.text)).toEqual(['DI는 생성자 주입만', 'MR 리뷰 반영'])
})

test('pinboard: 핀을 시스템 프롬프트에 싣는다', async ($, on) => {
  on('fs.read', () => ({ value: FILE }))
  on('session.root', () => ({ value: '/p' }))
  on('prompt.compose', () => ({ sections: [] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })

  expect(sections[0]?.id).toBe('pinboard:pins')
  expect(sections[0]?.text).toContain('1. [결정] DI는 생성자 주입만')
})
