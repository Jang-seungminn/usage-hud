/** 마지막으로 /handoff 를 권했을 때의 컨텍스트 사용률(%). */
export type WarnedAt = number

declare module 'claude-code' {
  interface PluginState {
    'auto-handoff': { warnedAt: WarnedAt }
  }
}
