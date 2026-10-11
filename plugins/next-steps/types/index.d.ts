export type NextSteps = string[]

declare module 'claude-code' {
  interface PluginState {
    'next-steps': { items: NextSteps }
  }
}
