import type { BoardAgent, BoardPin, BoardPlan, BoardTask, PlanStep, PlanTask, TaskStatus } from '../types'

// superpowers writes docs/superpowers/plans/<date>-<feature>.md and
// docs/superpowers/specs/<date>-<topic>-design.md; older versions docs/plans/.
export function isPlanPath(path: string): boolean {
  return /\.md$/i.test(path) && /(^|[\\/])plans?[\\/]/i.test(path)
}

export function isSpecPath(path: string): boolean {
  return /\.md$/i.test(path) && (/(^|[\\/])specs?[\\/]/i.test(path) || /-design\.md$/i.test(path))
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// Markdown emphasis and inline code read as plain text in a narrow pane.
export function plain(text: string): string {
  return text.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
}

export function oneLine(text: string, max = 160): string {
  const line = plain(text.split('\n').find(l => l.trim()) ?? '')
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function titleOf(text: string, path: string): string {
  const h1 = text.match(/^#\s+(.+)$/m)
  return h1 ? plain(h1[1]!) : baseName(path)
}

const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/
const HEADING = /^(#{2,4})\s+(.+)$/

// Each heading that holds checkboxes is one task; its checkboxes are the steps.
export function parsePlan(path: string, text: string): BoardPlan {
  const tasks: PlanTask[] = []
  const loose: PlanStep[] = []
  let current: PlanTask | undefined
  let isFenced = false

  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) isFenced = !isFenced
    if (isFenced) continue
    const heading = line.match(HEADING)
    if (heading) {
      current = { title: plain(heading[2]!), steps: [] }
      tasks.push(current)
      continue
    }
    const box = line.match(CHECKBOX)
    if (box) (current ? current.steps : loose).push({ text: plain(box[2]!), isDone: box[1] !== ' ' })
  }

  const goal = text.match(/^\s*\*\*Goal:?\*\*:?\s*(.+)$/im)
  return {
    path,
    title: titleOf(text, path),
    goal: goal ? plain(goal[1]!) : undefined,
    tasks: tasks.filter(t => t.steps.length > 0),
    loose,
  }
}

export type PlanProgress = { doneSteps: number; steps: number; doneTasks: number; tasks: number; current?: PlanTask }

export function planProgress(plan: BoardPlan): PlanProgress {
  const all = [...plan.tasks.flatMap(t => t.steps), ...plan.loose]
  const doneTasks = plan.tasks.filter(t => t.steps.every(s => s.isDone)).length
  return {
    doneSteps: all.filter(s => s.isDone).length,
    steps: all.length,
    doneTasks,
    tasks: plan.tasks.length,
    current: plan.tasks.find(t => t.steps.some(s => !s.isDone)),
  }
}

// ── TaskCreate / TaskUpdate / TodoWrite ──

export function createTask(list: BoardTask[], id: string, subject: string, activeForm?: string): BoardTask[] {
  if (list.some(t => t.id === id)) return list
  return [...list, { id, subject: oneLine(subject), status: 'pending', activeForm }]
}

export type TaskPatch = {
  taskId: string
  subject?: string
  activeForm?: string
  owner?: string
  status?: TaskStatus | 'deleted'
}

export function updateTask(list: BoardTask[], patch: TaskPatch): BoardTask[] {
  const status = patch.status
  if (status === 'deleted') return list.filter(t => t.id !== patch.taskId)
  const has = list.some(t => t.id === patch.taskId)
  const base: BoardTask[] = has ? list : [...list, { id: patch.taskId, subject: patch.subject ?? `#${patch.taskId}`, status: 'pending' }]
  return base.map(t =>
    t.id !== patch.taskId
      ? t
      : {
          ...t,
          subject: patch.subject === undefined ? t.subject : oneLine(patch.subject),
          activeForm: patch.activeForm ?? t.activeForm,
          owner: patch.owner ?? t.owner,
          status: status ?? t.status,
        },
  )
}

export function fromTodos(todos: readonly { content: string; status: TaskStatus; activeForm?: string }[]): BoardTask[] {
  return todos.map((t, i) => ({ id: `todo${i}`, subject: oneLine(t.content), status: t.status, activeForm: t.activeForm }))
}

const ORDER: Record<TaskStatus, number> = { in_progress: 0, pending: 1, completed: 2 }

// In progress first, then pending, then done; stable within each.
export function sortTasks(list: readonly BoardTask[]): BoardTask[] {
  return list.map((t, i) => [t, i] as const).sort((a, b) => ORDER[a[0].status] - ORDER[b[0].status] || a[1] - b[1]).map(([t]) => t)
}

// ── subagents ──

export function upsertAgent(list: BoardAgent[], id: string, patch: Partial<BoardAgent>, at: number): BoardAgent[] {
  const found = list.find(a => a.id === id)
  const next: BoardAgent = found
    ? { ...found, ...stripUndefined(patch) }
    : { id, description: patch.type ?? 'agent', status: 'running', startedAt: at, ...stripUndefined(patch) }
  return [...list.filter(a => a.id !== id), next].sort((a, b) => a.startedAt - b.startedAt).slice(-30)
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function bar(done: number, total: number, width: number): [number, number] {
  if (total <= 0) return [0, width]
  const filled = Math.min(width, Math.round((done / total) * width))
  return [filled, width - filled]
}

// ── pinboard, next-steps, auto-handoff 가 남기는 것 ──

const PIN = /^- \[(결정|할일)\] \d{4}-\d{2}-\d{2} (.+)$/

export function parsePins(text: string): BoardPin[] {
  return text.split('\n').flatMap(line => {
    const found = PIN.exec(line.trim())
    return found ? [{ kind: found[1] as BoardPin['kind'], text: found[2]!.trim() }] : []
  })
}

// 응답의 마지막 "다음 단계" 아래에 있는 열린 체크박스.
export function parseNextSteps(answer: string): string[] {
  const at = answer.lastIndexOf('다음 단계')
  if (at === -1) return []
  return answer
    .slice(at)
    .split('\n')
    .map(line => /^\s*[-*]\s*\[ \]\s*(.+)$/.exec(line)?.[1])
    .filter((one): one is string => one !== undefined && one.trim() !== '')
    .map(one => plain(one))
    .slice(0, 5)
}

export function countBullets(text: string): number {
  return text.split('\n').filter(line => line.startsWith('- ')).length
}
