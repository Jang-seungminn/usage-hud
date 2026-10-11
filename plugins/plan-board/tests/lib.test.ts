import { test, expect } from 'claude-code/testing'
import {
  bar, createTask, formatElapsed, fromTodos, isPlanPath, isSpecPath, oneLine, parsePlan, planProgress, sortTasks,
  updateTask, upsertAgent,
} from '../hooks/lib'

const PLAN = `# Auth Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development

**Goal:** Users can sign in with GitHub.

**Architecture:** OAuth callback route.

---

### Task 1: Callback route

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run it**

### Task 2: Session cookie

- [x] **Step 1: Write the failing test**
- [ ] **Step 2: Implement \`setCookie\`**

\`\`\`ts
// - [ ] not a step, inside a fence
\`\`\`

### Task 3: Logout

- [ ] **Step 1: Test**

## Notes

No checkboxes here.
`

test('recognises superpowers plan and spec paths', () => {
  expect(isPlanPath('/repo/docs/superpowers/plans/2026-10-11-auth.md')).toBe(true)
  expect(isPlanPath('/repo/docs/plans/auth.md')).toBe(true)
  expect(isPlanPath('/repo/src/plans.ts')).toBe(false)
  expect(isSpecPath('/repo/docs/superpowers/specs/2026-10-11-auth-design.md')).toBe(true)
  expect(isSpecPath('/repo/README.md')).toBe(false)
})

test('parses a superpowers plan into tasks and steps', () => {
  const p = parsePlan('/x/plans/a.md', PLAN)
  expect(p.title).toBe('Auth Feature Implementation Plan')
  expect(p.goal).toBe('Users can sign in with GitHub.')
  expect(p.tasks.map(t => t.title)).toEqual(['Task 1: Callback route', 'Task 2: Session cookie', 'Task 3: Logout'])
  expect(p.tasks[1]!.steps[1]).toEqual({ text: 'Step 2: Implement setCookie', isDone: false })
  const pr = planProgress(p)
  expect([pr.doneSteps, pr.steps, pr.doneTasks, pr.tasks]).toEqual([3, 5, 1, 3])
  expect(pr.current?.title).toBe('Task 2: Session cookie')
})

test('tasks: create, update, delete, order', () => {
  let list = createTask([], '1', 'Write spec')
  list = createTask(list, '2', 'Write plan')
  list = createTask(list, '1', 'dup ignored')
  list = updateTask(list, { taskId: '2', status: 'in_progress', activeForm: 'Writing plan' })
  list = updateTask(list, { taskId: '1', status: 'completed' })
  list = updateTask(list, { taskId: '9', status: 'pending', subject: 'Late' })
  expect(sortTasks(list).map(t => `${t.id}:${t.status}`)).toEqual(['2:in_progress', '9:pending', '1:completed'])
  expect(updateTask(list, { taskId: '9', status: 'deleted' }).length).toBe(2)
  expect(fromTodos([{ content: 'a', status: 'pending', activeForm: 'A' }])[0]!.id).toBe('todo0')
})

test('agents upsert by id and keep the first start', () => {
  let list = upsertAgent([], 'a1', { type: 'Explore' }, 100)
  list = upsertAgent(list, 'a1', { description: 'Find auth code', type: undefined }, 200)
  list = upsertAgent(list, 'a1', { status: 'done', endedAt: 500 }, 500)
  expect(list).toEqual([{ id: 'a1', description: 'Find auth code', type: 'Explore', status: 'done', startedAt: 100, endedAt: 500 }])
})

test('formatting', () => {
  expect(oneLine('\n  **Build** the `thing`\nsecond')).toBe('Build the thing')
  expect(oneLine('x'.repeat(200), 10).length).toBe(10)
  expect(formatElapsed(65_000)).toBe('1m05s')
  expect(formatElapsed(3_900_000)).toBe('1h05m')
  expect(bar(1, 4, 8)).toEqual([2, 6])
  expect(bar(0, 0, 8)).toEqual([0, 8])
})
