export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type BoardTask = { id: string; subject: string; status: TaskStatus; activeForm?: string; owner?: string }

export type PlanStep = { text: string; isDone: boolean }
export type PlanTask = { title: string; steps: PlanStep[] }

export type BoardPlan = {
  path: string
  title: string
  goal?: string
  tasks: PlanTask[]
  // Checkboxes outside any task heading.
  loose: PlanStep[]
}

export type BoardSpec = { path: string; title: string }

export type BoardAgent = {
  id: string
  description: string
  type?: string
  status: 'running' | 'done'
  startedAt: number
  endedAt?: number
}

export type BoardGoal = {
  // Set with /mission, or the session's first prompt until then.
  mission?: { text: string; isFromPrompt: boolean }
  // The built-in /goal completion condition.
  condition?: string
}

// pinboard 의 .claude/pinboard.md 한 줄: - [결정|할일] YYYY-MM-DD 내용
export type BoardPin = { kind: '결정' | '할일'; text: string }

// auto-handoff 의 .claude/handoff/ 상태
export type BoardHandoff = { writtenAt: number | null; notes: number }

declare module 'claude-code' {
  interface PluginState {
    'plan-board': {
      goal: BoardGoal
      tasks: BoardTask[]
      todos: BoardTask[]
      plan: BoardPlan | null
      spec: BoardSpec | null
      agents: BoardAgent[]
      now: number
      isOpened: boolean
      pins: BoardPin[]
      nextSteps: string[]
      handoff: BoardHandoff
    }
  }
}
