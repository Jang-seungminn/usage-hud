import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Figures, HudGit, HudTurn, HudWork } from '../types'
import {
  MODE_BADGE, SPINNER, burnEta, cacheHit, effortColor, formatClock, formatDuration,
  formatRemaining, formatTokens, gauge, hasReset, labelFor, levelOf, moodColor, moodOf,
  parseGitStatus, quip, shortModel, sortLimits, sprite, SPRITE_ROWS, SPRITE_WIDTH,
} from './lib'
import type { Dog, Mood } from './lib'

const figures = atom({ plugin: 'usage-hud', key: 'figures' } as const, { rateLimits: [] } as Figures)
const now = atom({ plugin: 'usage-hud', key: 'now' } as const, 0)
const frame = atom({ plugin: 'usage-hud', key: 'frame' } as const, 0)
const turn = atom({ plugin: 'usage-hud', key: 'turn' } as const, {
  isRunning: false, startedAt: 0, endedAt: 0, tools: 0, seed: 0,
} as HudTurn)
const git = atom({ plugin: 'usage-hud', key: 'git' } as const, null as HudGit | null)
const gitError = atom({ plugin: 'usage-hud', key: 'gitError' } as const, null as string | null)
const work = atom({ plugin: 'usage-hud', key: 'work' } as const, { subagents: 0, background: 0 } as HudWork)
const mode = atom({ plugin: 'usage-hud', key: 'mode' } as const, null as string | null)
const fired = atom({ plugin: 'usage-hud', key: 'fired' } as const, [] as string[])
const isFun = atom({ plugin: 'usage-hud', key: 'isFun' } as const, true)

const CTX_ALERT = 80
const LIMIT_ALERT = 90
const SLEEP_AFTER_MS = 10 * 60_000
const CHEER_MS = 20_000
// Columns: the widest quip and live counter, so neighbours never shift.
const INFO_WIDTH = 24
const BLOCK_WIDTH = SPRITE_WIDTH + INFO_WIDTH
const GAP = 2
const SESSION_MIN = 44
const LIMIT_BAR = 8
const CTX_BAR = 8
const LIVE_WIDTH = 24

let minuteTick: { cancel: () => void } | undefined
let animTick: { cancel: () => void } | undefined
let isGitRunning = false

// Keep only the figures the band draws; the breakdown never rides along.
function strip(c: Figures['context']): Figures['context'] {
  return c && { tokens: c.tokens, window: c.window, percent: c.percent }
}

async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  await update($, frame, f => f + 1)
}

async function refreshGit($: EngineInterface): Promise<void> {
  if (isGitRunning) return
  isGitRunning = true
  let summary: HudGit | null = null
  let error: string | null = null
  try {
    const repo = await $.session.repo()
    if (repo) {
      const r = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { cwd: repo.root, timeoutMs: 5000 })
      if (r.exitCode === 0) summary = parseGitStatus(r.stdout)
      else error = `exit ${r.exitCode}: ${r.stderr.trim().slice(0, 60)}`
    }
  } catch (err) {
    error = String(err instanceof Error ? err.message : err).slice(0, 80)
  } finally {
    isGitRunning = false
  }
  await update($, git, () => summary)
  await update($, gitError, () => error)
}

// Toast once when a gauge crosses its line; re-arm once it falls 5 points under.
async function checkAlerts($: EngineInterface): Promise<void> {
  const f = await read($, figures)
  const at = await $.clock.now()
  const done = new Set(await read($, fired))
  const toasts: string[] = []

  const gate = (key: string, pct: number, line: number, text: string) => {
    if (pct >= line && !done.has(key)) {
      done.add(key)
      toasts.push(text)
    } else if (pct < line - 5) {
      done.delete(key)
    }
  }

  const ctx = f.context?.percent
  if (ctx !== undefined) gate('ctx', ctx, CTX_ALERT, `(°□°;) context ${ctx}% — /compact 할 타이밍!`)

  for (const r of f.rateLimits) {
    if (hasReset(r, at)) {
      const key = `reset:${r.kind}:${r.resetsAt}`
      if (r.percentUsed >= 50 && !done.has(key)) {
        done.add(key)
        toasts.push(`ヽ(•‿•)ノ ${labelFor(r.kind)} 한도 리셋! 다시 달려보자`)
      }
      continue
    }
    const left = formatRemaining(r.resetsAt, at)
    gate(r.kind, r.percentUsed, LIMIT_ALERT, `(;°□°) ${labelFor(r.kind)} 한도 ${r.percentUsed}%${left ? ` — 리셋까지 ${left}` : ''}`)
  }

  await update($, fired, () => [...done].slice(-50))
  for (const text of toasts) $.ui.toast(text, { timeoutMs: 6000 })
}

async function takeMode($: EngineInterface, permissionMode: string | undefined): Promise<void> {
  if (permissionMode) await update($, mode, m => (m === permissionMode ? m : permissionMode))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'hud', description: 'usage-hud: 마스코트 켜기/끄기' })
    const u = await $.session.usage()
    const model = await $.session.model()
    await update($, figures, f => ({ ...f, context: strip(u.context), rateLimits: u.rateLimits, cost: u.cost, model }))
    // The first version wrote the status line; clear what it left.
    $.ui.status(undefined)
    await tick($)
    await refreshGit($)
    await checkAlerts($)
    // One frame a second animates the cat and the live turn clock.
    animTick?.cancel()
    animTick = $.clock.every(1000, () => tick($))
    minuteTick?.cancel()
    minuteTick = $.clock.every(60_000, async () => {
      await tick($)
      await refreshGit($)
      await checkAlerts($)
    })
    return result
  })

  on('command.run', { command: 'hud' }, async $ => {
    const isOn = !(await read($, isFun))
    await update($, isFun, () => isOn)
    return { text: isOn ? '(•‿•) 마스코트 등장!' : '마스코트 퇴근. /hud 로 다시 부르기' }
  })

  on('session.measure', async ($, e, next) => {
    // Measured after every turn, so a /model switch shows by the next one.
    const model = await $.session.model()
    await update($, figures, f => ({ ...f, context: strip(e.context), rateLimits: e.rateLimits, cost: e.cost, model }))
    await checkAlerts($)
    return next(e)
  })

  // Subagents raise no turn.start: this is the main loop's turn.
  on('turn.start', async ($, e, next) => {
    const started = await $.clock.now()
    const cost = (await read($, figures)).cost?.usd
    await update($, turn, () => ({
      isRunning: true, startedAt: started, endedAt: 0, tools: 0, costAtStart: cost, seed: started / 1000,
    }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    if (isMain) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      await update($, figures, f => (f.effort === effort ? f : { ...f, effort }))
    }
    const r = yield* next(e)
    if (isMain && r && r.usage) {
      const hit = cacheHit(r.usage)
      await update($, turn, t => ({ ...t, cacheHit: hit }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    await update($, turn, t => (t.isRunning ? { ...t, tools: t.tools + 1 } : t))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const ended = await $.clock.now()
    const u = e.usage
    await update($, turn, t => ({
      ...t,
      isRunning: false,
      endedAt: ended,
      tokensIn: u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : t.tokensIn,
      tokensOut: u ? u.output_tokens : t.tokensOut,
    }))
    await tick($)
    await refreshGit($)
    return result
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await update($, work, w => ({ ...w, subagents: w.subagents + 1 }))
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await update($, work, w => ({ ...w, subagents: Math.max(0, w.subagents - 1) }))
    return next(e)
  })

  // The Stop snapshot is the truth: it reconciles any start/stop we missed.
  on('classic.Stop', async ($, e, next) => {
    const tasks = e.background_tasks ?? []
    const subagents = tasks.filter(t => t.type === 'subagent').length
    await update($, work, () => ({ subagents, background: tasks.length - subagents }))
    await takeMode($, e.permission_mode)
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await takeMode($, e.permission_mode)
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    await takeMode($, e.permission_mode)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const f = await read($, figures)
    if (!f.context && f.rateLimits.length === 0 && !f.cost) return next(e)

    const at = (await read($, now)) || Date.now()
    const fr = await read($, frame)
    const t = await read($, turn)
    const g = await read($, git)
    const gErr = await read($, gitError)
    const w = await read($, work)
    const m = await read($, mode)
    const fun = await read($, isFun)
    const isWorking = e.props.isWorking || t.isRunning

    const { Box, Text } = $.ui.resolve(e)

    const bar = (pct: number, width: number) => {
      const level = levelOf(pct)
      const [filled, empty] = gauge(pct, width)
      return (
        <Text>
          <Text color={level}>{'█'.repeat(filled)}</Text>
          <Text color="subtle">{'░'.repeat(empty)}</Text>
          <Text color={level} bold> {pct}%</Text>
        </Text>
      )
    }

    const sinceEnd = !isWorking && t.endedAt ? at - t.endedAt : undefined
    const moodFor = (pct: number): Mood =>
      sinceEnd !== undefined && sinceEnd > SLEEP_AFTER_MS && pct < 50
        ? 'sleep'
        : sinceEnd !== undefined && sinceEnd < CHEER_MS && pct < 80
          ? 'cheer'
          : moodOf(pct, isWorking)

    const room = Math.max(1, e.props.maxRows)
    const cols = e.viewport?.columns ?? 120
    const showDogs = fun && room >= SPRITE_ROWS && cols >= 2 * BLOCK_WIDTH + GAP
    // Wide enough, the session column sits beside the dogs; otherwise below them.
    const isOneRow = cols >= 2 * BLOCK_WIDTH + 2 * GAP + SESSION_MIN
    const ctxPct = f.context?.percent

    // ── one block per rate-limit window: its dog, its gauge, its countdown, its quip ──
    const blocks = []
    for (const r of sortLimits(f.rateLimits)) {
      const label = labelFor(r.kind)
      const isReset = hasReset(r, at)
      const dog: Dog | undefined = r.kind === 'five_hour' ? 'puppy' : r.kind === 'seven_day' ? 'senior' : undefined
      // The puppy also carries the context window: both run out within the session.
      const pct = isReset ? 0 : dog === 'puppy' ? Math.max(r.percentUsed, ctxPct ?? 0) : r.percentUsed
      const mood = moodFor(pct)
      const color = moodColor(mood, dog === 'senior' ? 'suggestion' : 'claude')
      const left = formatRemaining(r.resetsAt, at)
      const eta = isReset ? undefined : burnEta(r, at)

      const info = (
        <Box flexDirection="column" width={INFO_WIDTH} flexShrink={0}>
          <Text wrap="truncate">
            <Text bold color={dog ? color : undefined}>{label.padEnd(3)}</Text>
            {isReset ? <Text color="success">{'░'.repeat(LIMIT_BAR)} 리셋됨</Text> : bar(r.percentUsed, LIMIT_BAR)}
          </Text>
          <Text wrap="truncate">
            {left ? <Text dimColor>↻ {left}</Text> : null}
            {eta === undefined ? null : <Text color="error" bold> ⚡{formatDuration(eta)} 후 소진</Text>}
          </Text>
          {showDogs && dog ? <Text color={color} wrap="truncate">“{quip(dog, mood, t.seed)}”</Text> : null}
        </Box>
      )

      blocks.push(
        <Box key={r.kind} flexDirection="row" width={showDogs && dog ? BLOCK_WIDTH : INFO_WIDTH} flexShrink={0}>
          {showDogs && dog ? (
            <Box flexDirection="column" width={SPRITE_WIDTH} flexShrink={0}>
              {sprite(dog, mood, fr).map((line, i) => (
                <Text key={`l${i}`} color={color} bold>{line}</Text>
              ))}
            </Box>
          ) : null}
          {info}
        </Box>,
      )
    }

    // ── the session column: context, this turn, where we are ──
    const live = []
    const where = []

    const ctxLine = f.context ? (
      ctxPct === undefined || f.context.tokens === undefined ? (
        <Text key="ctx" dimColor>ctx –/{formatTokens(f.context.window)}</Text>
      ) : (
        <Text key="ctx">
          <Text dimColor>ctx </Text>
          {bar(ctxPct, CTX_BAR)}
          <Text dimColor> {formatTokens(f.context.tokens)}/{formatTokens(f.context.window)}</Text>
        </Text>
      )
    ) : null

    if (t.isRunning) {
      live.push(
        <Box key="live" width={LIVE_WIDTH} flexShrink={0}>
          <Text>
            <Text color="claude">{SPINNER[fr % SPINNER.length]} </Text>
            <Text bold>{formatClock(at - t.startedAt)}</Text>
            <Text dimColor> · tools </Text>
            <Text bold>{t.tools}</Text>
          </Text>
        </Box>,
      )
    } else if (t.endedAt) {
      live.push(
        <Box key="live" width={LIVE_WIDTH} flexShrink={0}>
          <Text dimColor>last {formatClock(t.endedAt - t.startedAt)} · tools {t.tools}</Text>
        </Box>,
      )
    }

    const turnCost = f.cost && t.costAtStart !== undefined ? f.cost.usd - t.costAtStart : undefined
    if (turnCost !== undefined && turnCost > 0.0049) {
      live.push(
        <Text key="turn">
          <Text color="claude">+${turnCost.toFixed(2)}</Text>
          {t.tokensIn !== undefined && t.tokensOut !== undefined ? (
            <Text dimColor> {formatTokens(t.tokensIn)}↑ {formatTokens(t.tokensOut)}↓</Text>
          ) : null}
        </Text>,
      )
    }

    if (t.cacheHit !== undefined) {
      live.push(
        <Text key="cache">
          <Text dimColor>cache </Text>
          <Text color={t.cacheHit >= 70 ? 'success' : t.cacheHit >= 30 ? 'warning' : 'error'}>{t.cacheHit}%</Text>
        </Text>,
      )
    }

    if (f.model) {
      where.push(
        <Text key="model">
          <Text color="suggestion" bold>{shortModel(f.model)}</Text>
          {f.effort ? <Text color={effortColor(f.effort)}> · {f.effort}</Text> : null}
        </Text>,
      )
    }

    const badge = m ? MODE_BADGE[m] : undefined
    if (badge) {
      where.push(
        <Text key="mode" color="inverseText" backgroundColor={badge.color} bold> {badge.label} </Text>,
      )
    }

    if (f.cost) {
      where.push(
        <Text key="cost">
          <Text color="claude" bold>${f.cost.usd.toFixed(2)}</Text>
        </Text>,
      )
    }

    if (g) {
      where.push(
        <Text key="git">
          <Text color="suggestion">⎇ {g.branch}</Text>
          {g.ahead ? <Text color="success"> ↑{g.ahead}</Text> : null}
          {g.behind ? <Text color="warning"> ↓{g.behind}</Text> : null}
          {g.staged ? <Text color="success"> +{g.staged}</Text> : null}
          {g.modified ? <Text color="warning"> ~{g.modified}</Text> : null}
          {g.untracked ? <Text dimColor> ?{g.untracked}</Text> : null}
          {!g.staged && !g.modified && !g.untracked ? <Text color="success"> ✓</Text> : null}
        </Text>,
      )
    } else if (gErr) {
      where.push(<Text key="git" dimColor>⎇ git ✗ {gErr}</Text>)
    }

    if (w.subagents) {
      where.push(
        <Text key="agents">
          <Text dimColor>agents </Text>
          <Text color="claude" bold>{w.subagents}</Text>
        </Text>,
      )
    }

    if (w.background) {
      where.push(
        <Text key="bg">
          <Text dimColor>bg </Text>
          <Text color="warning" bold>{w.background}</Text>
        </Text>,
      )
    }

    // Short on room, context goes first, then the turn, then the workspace.
    const rows = [ctxLine ? [ctxLine] : [], live, where].filter(r => r.length > 0).slice(0, room)
    const session = (
      <Box key="session" flexDirection="column" flexGrow={1} flexShrink={1}>
        {rows.map((items, i) => (
          <Box key={`row${i}`} flexDirection="row" flexWrap="wrap" columnGap={2}>
            {items}
          </Box>
        ))}
      </Box>
    )

    if (isOneRow) {
      return (
        <Box flexDirection="row" columnGap={GAP}>
          {blocks}
          {session}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={GAP}>
          {blocks}
        </Box>
        {session}
      </Box>
    )
  })
}
