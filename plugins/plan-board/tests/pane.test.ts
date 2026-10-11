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
