import { expect, test } from 'claude-code/testing'

import { split } from '../hooks/register'

test('prompt-coach: 모델 응답을 요청과 메모로 나눈다', async () => {
  const got = split('<<<요청>>>\nA를 고쳐라\n<<<메모>>>\n- 가정: 없음')

  expect(got).toEqual({ prompt: 'A를 고쳐라', notes: '- 가정: 없음' })
})
