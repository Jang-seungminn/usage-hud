export type Snapshot = {
  at: string
  model: string
  percent: number | null
  usd: number | null
  pins: string[]
  next: string[]
  handoff: string | null
  notes: number
}

declare module 'claude-code' {
  interface PluginState {
    'work-panel': { snapshot: Snapshot | null }
  }
}
