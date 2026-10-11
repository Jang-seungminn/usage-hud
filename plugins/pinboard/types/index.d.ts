export type Pin = { kind: '결정' | '할일'; date: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    pinboard: { pins: Pin[] }
  }
}
