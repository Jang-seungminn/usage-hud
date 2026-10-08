export type HudRateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Figures = {
  context?: { tokens?: number; window: number; percent?: number }
  rateLimits: HudRateLimit[]
  cost?: { usd: number }
  model?: string
  effort?: string
}

export type HudTurn = {
  isRunning: boolean
  startedAt: number
  endedAt: number
  tools: number
  costAtStart?: number
  tokensIn?: number
  tokensOut?: number
  cacheHit?: number
  seed: number
}

export type HudGit = {
  branch: string
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
}

export type HudWork = { subagents: number; background: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      figures: Figures
      now: number
      frame: number
      turn: HudTurn
      git: HudGit | null
      gitError: string | null
      work: HudWork
      mode: string | null
      fired: string[]
      isFun: boolean
    }
  }
}
