import { test, expect, mock } from 'claude-code/testing'

const PANE = {
  component: 'Pane' as const,
  requestId: 'plan-board',
  props: { title: 'Plan', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { top: 0, bodyRows: 40 } } as never,
}

test('empty pane says how to start', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  const ui = await $.ui.mount({ plugin: 'plan-board', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /아직 계획이 없습니다/ })).toBeDefined()
  await ui.unmount()
})

test('pane follows /mission, tasks and subagents on every surface', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  // Nothing sits beneath the plugin in a test: answer the tools ourselves.
  on('tool.call', { tool: 'TaskCreate' }, ($, e) => ({ result: { task: { id: '1', subject: 'Write plan' } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true, taskId: '1', updatedFields: ['status'] } }) as never)
  on('tool.call', { tool: 'Agent' }, () => ({ result: { agentId: 'ag1' } }) as never)

  await $.command.run({ command: 'mission', args: 'GitHub 로그인 붙이기' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write plan', description: 'superpowers plan' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress', activeForm: 'Writing plan' })
  await $.tool.call({ tool: 'Agent', description: 'Explore auth code', prompt: 'look', subagent_type: 'Explore' })
  await clock.advance(65_000)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'plan-board', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /GitHub 로그인 붙이기/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Writing plan/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Explore auth code/ })).toBeDefined()
    await ui.unmount()
  }
})

test('pane shows pins, the last answer’s next steps and the handoff', async ($, on) => {
  mock.clock(on, { now: 10 * 60_000 })
  on('session.root', () => ({ value: '/p' }))
  on('fs.read', (_, e) =>
    e.path === '/p/.claude/pinboard.md'
      ? { value: '- [결정] 2026-10-10 DI는 생성자 주입만\n' }
      : e.path === '/p/.claude/handoff/NOTES.md'
        ? { value: '- 메모 하나\n' }
        : { deny: 'missing' },
  )
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5 * 60_000, isLink: false } }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({ turnId: 't', reason: 'answer', answer: '완료.\n\n다음 단계\n- [ ] 실기 확인', isAborted: false } as never)

  const ui = await $.ui.mount({ plugin: 'plan-board', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /DI는 생성자 주입만/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\. 실기 확인/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /인수인계서 5m00s 전/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /메모 1개/ })).toBeDefined()
  await ui.unmount()
})
