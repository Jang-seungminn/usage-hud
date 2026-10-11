import { expect, test } from 'claude-code/testing'

import { parse } from '../hooks/register'

test('next-steps: 다음 단계 아래의 체크박스만 뽑는다', async () => {
  const answer = '수정했습니다.\n- [ ] 앞의 것은 무시\n\n**다음 단계**\n- [ ] 빌드 확인\n- [x] 끝난 것\n- [ ] 테스트 추가'

  expect(parse(answer)).toEqual(['빌드 확인', '테스트 추가'])
  expect(parse('그냥 답변')).toEqual([])
})
