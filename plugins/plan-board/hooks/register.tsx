import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardAgent, BoardGoal, BoardPlan, BoardSpec, BoardTask } from '../types'
import {
  bar, baseName, createTask, formatElapsed, fromTodos, isPlanPath, isSpecPath, oneLine, parsePlan,
  planProgress, sortTasks, titleOf, updateTask, upsertAgent,
} from './lib'

const PANE = 'plan-board'
const TITLE = 'Plan'

const goal = atom({ plugin: 'plan-board', key: 'goal' } as const, {} as BoardGoal)
const tasks = atom({ plugin: 'plan-board', key: 'tasks' } as const, [] as BoardTask[])
const todos = atom({ plugin: 'plan-board', key: 'todos' } as const, [] as BoardTask[])
const plan = atom({ plugin: 'plan-board', key: 'plan' } as const, null as BoardPlan | null)
const spec = atom({ plugin: 'plan-board', key: 'spec' } as const, null as BoardSpec | null)
const agents = atom({ plugin: 'plan-board', key: 'agents' } as const, [] as BoardAgent[])
const now = atom({ plugin: 'plan-board', key: 'now' } as const, 0)
const isOpened = atom({ plugin: 'plan-board', key: 'isOpened' } as const, false)

const SHOW_DONE = 3
const SHOW_NEXT_TASKS = 4
const SHOW_DONE_AGENTS = 3

let ticker: { cancel: () => void } | undefined

// Opened once, unasked, the first time there is something to show.
async function openOnce($: EngineInterface): Promise<void> {
  if (await read($, isOpened)) return
  await update($, isOpened, () => true)
  void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
}

async function loadPlan($: EngineInterface, path: string): Promise<void> {
  try {
    const text = await $.fs.read(path)
    await update($, plan, () => parsePlan(path, text))
    await openOnce($)
  } catch {
    // Moved or deleted: keep the last parse.
  }
}

async function loadSpec($: EngineInterface, path: string): Promise<void> {
  try {
    const text = await $.fs.read(path)
    await update($, spec, () => ({ path, title: titleOf(text, path) }))
    await openOnce($)
  } catch {
    // ignore
  }
}

async function tick($: EngineInterface): Promise<void> {
  const list = await read($, agents)
  if (!list.some(a => a.status === 'running')) return
  const at = await $.clock.now()
  await update($, now, () => at)
}

async function reset($: EngineInterface): Promise<void> {
  await update($, tasks, () => [])
  await update($, todos, () => [])
  await update($, plan, () => null)
  await update($, spec, () => null)
  await update($, agents, () => [])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'board', description: 'plan-board: 진행 패널 열기 (/board clear 로 초기화)' })
    await $.command.register({ name: 'mission', description: 'plan-board: 이 세션의 목표 정하기 (/mission <목표>, /mission clear)' })
    await update($, now, () => 0)
    ticker?.cancel()
    ticker = $.clock.every(1000, () => tick($))
    // A reload keeps the state: show the pane again if it had content.
    const p = await read($, plan)
    if (p) await loadPlan($, p.path)
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await reset($)
      await update($, goal, () => ({}))
    }
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await reset($)
      return { text: 'plan-board: 작업·플랜·에이전트 목록을 비웠습니다. 목표는 /mission clear 로 지웁니다.' }
    }
    await update($, isOpened, () => true)
    const r = await $.ui.open({ id: PANE, title: TITLE })
    return { text: r.isPlaced ? 'plan-board 패널을 열었습니다.' : 'plan-board: 터미널을 넓히면 패널이 보입니다.' }
  })

  on('command.run', { command: 'mission' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) {
      const g = await read($, goal)
      return { text: g.mission ? `목표: ${g.mission.text}` : '목표가 없습니다. /mission <목표> 로 정하세요.' }
    }
    if (text === 'clear') {
      await update($, goal, g => ({ ...g, mission: undefined }))
      return { text: '목표를 지웠습니다.' }
    }
    await update($, goal, g => ({ ...g, mission: { text: oneLine(text, 300), isFromPrompt: false } }))
    await openOnce($)
    return { text: `목표: ${oneLine(text, 300)}` }
  })

  // The built-in /goal sets a completion condition; mirror it.
  on('command.run', { command: 'goal' }, async ($, e, next) => {
    const result = await next(e)
    const args = e.args.trim()
    if (args === 'clear') await update($, goal, g => ({ ...g, condition: undefined }))
    else if (args) await update($, goal, g => ({ ...g, condition: oneLine(args, 300) }))
    return result
  }).catch(($, e, next) => next(e))

  // Until /mission names one, the session's first real prompt is its goal.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const text = e.prompt.trim()
    if (text && !text.startsWith('/') && (e.source === undefined || e.source === 'user')) {
      await update($, goal, g => (g.mission ? g : { ...g, mission: { text: oneLine(text), isFromPrompt: true } }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Agent') {
      const at = await $.clock.now()
      const placeholder = `call:${e.tool_use_id}`
      await update($, agents, list =>
        upsertAgent(list, placeholder, { description: oneLine(e.description, 60), type: e.subagent_type, status: 'running' }, at),
      )
      await openOnce($)
      const r = await next(e)
      const agentId = !('deny' in r && r.deny) && !r.isError ? (r.result as { agentId?: string } | undefined)?.agentId : undefined
      const ended = await $.clock.now()
      await update($, agents, list => {
        const rest = list.filter(a => a.id !== placeholder)
        if (!agentId) return upsertAgent(rest, placeholder, { description: oneLine(e.description, 60), status: 'done', endedAt: ended }, at)
        const isForeground = e.run_in_background === false
        return upsertAgent(
          rest,
          agentId,
          {
            description: oneLine(e.description, 60),
            type: e.subagent_type,
            ...(isForeground ? { status: 'done' as const, endedAt: ended } : {}),
          },
          at,
        )
      })
      return r
    }

    const r = await next(e)
    if ('deny' in r && r.deny) return r
    if (r.isError) return r

    if (e.tool === 'TaskCreate') {
      const id = (r.result as { task?: { id: string } } | undefined)?.task?.id
      if (id) {
        await update($, tasks, list => createTask(list, id, e.subject, e.activeForm))
        await openOnce($)
      }
    } else if (e.tool === 'TaskUpdate') {
      await update($, tasks, list =>
        updateTask(list, { taskId: e.taskId, subject: e.subject, activeForm: e.activeForm, owner: e.owner, status: e.status }),
      )
    } else if (e.tool === 'TaskList') {
      // The list is the truth: take its statuses and subjects.
      const listed = (r.result as { tasks?: { id: string; subject: string; status: BoardTask['status']; owner?: string }[] } | undefined)?.tasks
      if (listed) {
        await update($, tasks, list =>
          listed.map(t => ({ ...list.find(o => o.id === t.id), id: t.id, subject: oneLine(t.subject), status: t.status, owner: t.owner })),
        )
      }
    } else if (e.tool === 'TodoWrite') {
      await update($, todos, () => fromTodos(e.todos))
      await openOnce($)
    } else if (e.tool === 'ProposeGoal') {
      const condition = (r.result as { condition?: string } | undefined)?.condition
      if (condition) await update($, goal, g => ({ ...g, condition: oneLine(condition, 300) }))
    } else if (e.tool === 'Write' || e.tool === 'Edit') {
      if (isPlanPath(e.file_path)) await loadPlan($, e.file_path)
      else if (isSpecPath(e.file_path)) await loadSpec($, e.file_path)
    }
    return r
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStart', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, agents, list => upsertAgent(list, e.agent_id, { type: e.agent_type, status: 'running' }, at))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, agents, list =>
      list.some(a => a.id === e.agent_id) ? upsertAgent(list, e.agent_id, { status: 'done', endedAt: at }, at) : list,
    )
    return next(e)
  }).catch(($, e, next) => next(e))

  // The main loop's Stop lists what still runs: whatever is not listed is done.
  on('classic.Stop', async ($, e, next) => {
    const live = (e.background_tasks ?? []).filter(t => t.type === 'subagent' || t.agent_type !== undefined)
    const at = await $.clock.now()
    await update($, agents, list => {
      let out = list.map(a =>
        a.status === 'running' && !live.some(t => t.id === a.id) ? { ...a, status: 'done' as const, endedAt: at } : a,
      )
      for (const t of live) {
        out = upsertAgent(out, t.id, { description: oneLine(t.description || t.name || 'agent', 60), type: t.agent_type, status: 'running' }, at)
      }
      return out
    })
    // Plans are also ticked off by sed or a script: re-read at each turn's end.
    const p = await read($, plan)
    if (p) await loadPlan($, p.path)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const g = await read($, goal)
    const p = await read($, plan)
    const s = await read($, spec)
    const taskList = await read($, tasks)
    const todoList = await read($, todos)
    const agentList = await read($, agents)
    const at = (await read($, now)) || (await $.clock.now())
    const width = Math.max(20, e.props.bodyColumns)
    const barWidth = Math.max(6, Math.min(20, width - 16))

    const sections = []

    const heading = (key: string, label: string, extra?: string) => (
      <Text key={key} bold color="claude" wrap="truncate">
        {label}
        {extra ? <Text dimColor> {extra}</Text> : null}
      </Text>
    )

    const progress = (done: number, total: number) => {
      const [filled, empty] = bar(done, total, barWidth)
      const isAll = total > 0 && done === total
      return (
        <Text wrap="truncate">
          <Text color={isAll ? 'success' : 'claude'}>{'█'.repeat(filled)}</Text>
          <Text color="subtle">{'░'.repeat(empty)}</Text>
          <Text bold> {done}/{total}</Text>
        </Text>
      )
    }

    // ── goal ──
    const goalLines = []
    if (g.mission) {
      goalLines.push(
        <Text key="mission" wrap="wrap">
          {g.mission.text}
          {g.mission.isFromPrompt ? <Text dimColor> (첫 프롬프트)</Text> : null}
        </Text>,
      )
    }
    if (p?.goal && p.goal !== g.mission?.text) goalLines.push(<Text key="plan-goal" wrap="wrap"><Text dimColor>plan </Text>{p.goal}</Text>)
    if (g.condition) goalLines.push(<Text key="cond" wrap="wrap"><Text color="success">/goal </Text>{g.condition}</Text>)
    if (goalLines.length > 0) {
      sections.push(
        <Box key="goal" flexDirection="column">
          {heading('h-goal', '◎ 목표')}
          {goalLines}
        </Box>,
      )
    }

    // ── superpowers spec and plan ──
    if (p || s) {
      const lines = []
      if (s) lines.push(<Text key="spec" dimColor wrap="truncate">spec  {s.title}</Text>)
      if (p) {
        const pr = planProgress(p)
        lines.push(<Text key="title" wrap="truncate"><Text dimColor>plan  </Text>{p.title}</Text>)
        if (pr.tasks > 0) {
          lines.push(<Box key="bar" flexDirection="row"><Text dimColor>task  </Text>{progress(pr.doneTasks, pr.tasks)}</Box>)
        }
        if (pr.steps > 0) {
          lines.push(<Box key="sbar" flexDirection="row"><Text dimColor>step  </Text>{progress(pr.doneSteps, pr.steps)}</Box>)
        }
        if (pr.current) {
          const cur = pr.current
          lines.push(<Text key="cur" bold color="warning" wrap="truncate">▶ {cur.title}</Text>)
          cur.steps.forEach((step, i) =>
            lines.push(
              <Text key={`cs${i}`} wrap="truncate" dimColor={step.isDone}>
                {'  '}{step.isDone ? '✓' : '○'} {step.text}
              </Text>,
            ),
          )
          const after = p.tasks.slice(p.tasks.indexOf(cur) + 1).filter(t => t.steps.some(st => !st.isDone))
          after.slice(0, SHOW_NEXT_TASKS).forEach((t, i) =>
            lines.push(<Text key={`nt${i}`} wrap="truncate">○ {t.title}</Text>),
          )
          if (after.length > SHOW_NEXT_TASKS) lines.push(<Text key="more" dimColor>  … 외 {after.length - SHOW_NEXT_TASKS}개</Text>)
        } else if (pr.steps > 0) {
          lines.push(<Text key="all" color="success">✓ 플랜의 모든 단계 완료</Text>)
        }
      }
      sections.push(
        <Box key="plan" flexDirection="column">
          {heading('h-plan', '▤ 플랜', p ? baseName(p.path) : undefined)}
          {lines}
        </Box>,
      )
    }

    // ── tasks (TaskCreate/TaskUpdate) and todos (TodoWrite) ──
    const taskSection = (key: string, label: string, list: BoardTask[]) => {
      if (list.length === 0) return null
      const sorted = sortTasks(list)
      const done = sorted.filter(t => t.status === 'completed')
      const open = sorted.filter(t => t.status !== 'completed')
      return (
        <Box key={key} flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            {heading(`h-${key}`, label)}
            {progress(done.length, list.length)}
          </Box>
          {open.map(t =>
            t.status === 'in_progress' ? (
              <Text key={t.id} bold color="warning" wrap="truncate">▶ {t.activeForm || t.subject}{t.owner ? <Text dimColor> @{t.owner}</Text> : null}</Text>
            ) : (
              <Text key={t.id} wrap="truncate">○ {t.subject}{t.owner ? <Text dimColor> @{t.owner}</Text> : null}</Text>
            ),
          )}
          {done.slice(-SHOW_DONE).map(t => (
            <Text key={t.id} dimColor wrap="truncate">✓ {t.subject}</Text>
          ))}
          {done.length > SHOW_DONE ? <Text dimColor>  … 완료 {done.length - SHOW_DONE}개 더</Text> : null}
        </Box>
      )
    }
    const ts = taskSection('tasks', '☰ 작업', taskList)
    if (ts) sections.push(ts)
    const td = taskSection('todos', '☰ 할 일', todoList)
    if (td) sections.push(td)

    // ── subagents ──
    if (agentList.length > 0) {
      const running = agentList.filter(a => a.status === 'running')
      const finished = agentList.filter(a => a.status === 'done')
      sections.push(
        <Box key="agents" flexDirection="column">
          {heading('h-agents', '⚙ 에이전트', `실행 ${running.length} · 완료 ${finished.length}`)}
          {running.map(a => (
            <Text key={a.id} wrap="truncate">
              <Text color="claude">● </Text>
              {a.description}
              {a.type ? <Text dimColor> [{a.type}]</Text> : null}
              <Text dimColor> {formatElapsed(at - a.startedAt)}</Text>
            </Text>
          ))}
          {finished.slice(-SHOW_DONE_AGENTS).map(a => (
            <Text key={a.id} dimColor wrap="truncate">
              ✓ {a.description}
              {a.endedAt ? ` ${formatElapsed(a.endedAt - a.startedAt)}` : ''}
            </Text>
          ))}
        </Box>,
      )
    }

    if (sections.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor wrap="wrap">아직 계획이 없습니다.</Text>
          <Text dimColor wrap="wrap">{'/mission <목표>'} 로 목표를 정하거나, 플랜·작업·서브에이전트가 생기면 여기에 나타납니다.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        {sections}
      </Box>
    )
  })
}
