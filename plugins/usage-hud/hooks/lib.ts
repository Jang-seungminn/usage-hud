// Pure helpers for the HUD: no `$`, so they are unit-tested directly.

export type Level = 'success' | 'warning' | 'error'
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const HOUR = 3_600_000
export const WINDOW_MS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 7 * 24 * HOUR }
const BAR_WIDTH = 10

export const levelOf = (pct: number): Level => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')

export const gauge = (pct: number, width = BAR_WIDTH): [number, number] => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return [filled, width - filled]
}

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const formatDuration = (ms: number): string => {
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`
}

export const formatClock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export const formatRemaining = (resetsAt: string | undefined, now: number): string => {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  return Number.isFinite(ms) && ms > 0 ? formatDuration(ms) : ''
}

export const hasReset = (limit: Limit, now: number): boolean =>
  limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now

// five_hour → 5h, seven_day → 7d, seven_day_fable → 7d fable, spend_limit → spend
export const labelFor = (kind: string): string =>
  kind
    .replace(/^five_hour/, '5h')
    .replace(/^seven_day/, '7d')
    .replace(/^spend_limit/, 'spend')
    .replace(/_/g, ' ')

const ORDER = ['five_hour', 'seven_day']
const rank = (kind: string): number => {
  const i = ORDER.indexOf(kind)
  return i === -1 ? ORDER.length : i
}
export const sortLimits = <T extends Limit>(limits: readonly T[]): T[] =>
  [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))

/**
 * When the window runs dry at its average pace so far, in ms from `now`;
 * undefined when it resets first, or there is too little to judge.
 */
export const burnEta = (limit: Limit, now: number): number | undefined => {
  const span = WINDOW_MS[limit.kind.replace(/^(five_hour|seven_day).*/, '$1')]
  if (!span || !limit.resetsAt || limit.percentUsed <= 0) return undefined
  const resetAt = Date.parse(limit.resetsAt)
  const elapsed = now - (resetAt - span)
  if (!Number.isFinite(resetAt) || elapsed < 5 * 60_000) return undefined
  if (limit.percentUsed >= 100) return 0
  const eta = ((100 - limit.percentUsed) / limit.percentUsed) * elapsed
  return eta < resetAt - now ? eta : undefined
}

export const cacheHit = (u: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): number | undefined => {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : undefined
}

export type GitSummary = {
  branch: string
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
}

// `git status --porcelain=v1 -b`
export const parseGitStatus = (out: string): GitSummary => {
  const g: GitSummary = { branch: '?', ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0 }
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      g.branch = head.startsWith('No commits yet on ') ? head.slice(18) : head.split('...')[0]!.split(' ')[0]!
      g.ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
      g.behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
    } else if (line.startsWith('??')) {
      g.untracked++
    } else if (line.length >= 2) {
      if (line[0] !== ' ') g.staged++
      if (line[1] !== ' ') g.modified++
    }
  }
  return g
}

// claude-opus-5-5 → Opus 5.5, claude-fable-5-1[1m] → Fable 5.1
export const shortModel = (id: string): string => {
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  if (!m || !m[1]) return id
  return `${m[1][0]!.toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`
}

export const effortColor = (effort: string): 'subtle' | 'text' | 'warning' | 'claude' =>
  effort === 'low' ? 'subtle' : effort === 'xhigh' ? 'warning' : effort === 'max' ? 'claude' : 'text'

// Modes worth a badge; `default` gets none.
export const MODE_BADGE: Record<string, { label: string; color: 'planMode' | 'autoAccept' | 'warning' | 'error' }> = {
  plan: { label: 'PLAN', color: 'planMode' },
  acceptEdits: { label: 'EDITS OK', color: 'autoAccept' },
  auto: { label: 'AUTO', color: 'warning' },
  bypassPermissions: { label: 'YOLO', color: 'error' },
  dontAsk: { label: 'NO ASK', color: 'error' },
}

// ── the fun part ─────────────────────────────────────────────

export type Mood = 'sleep' | 'chill' | 'busy' | 'cheer' | 'sweat' | 'panic' | 'dead'
export type Dog = 'puppy' | 'senior'

export const moodOf = (pct: number, isWorking: boolean): Mood =>
  pct >= 100 ? 'dead' : pct >= 80 ? 'panic' : pct >= 50 ? 'sweat' : isWorking ? 'busy' : 'chill'

// Five-line dogs in plain ASCII, so every terminal gives them the same width.
// The puppy (5h) is the classic standing dog; the senior (7d) the classic
// big-head profile, panting, who moves at half the pace. A mood's frames say the
// eyes, the tongue or legs, the tail and what floats beside the head.
export const SPRITE_WIDTH = 17
export const SPRITE_ROWS = 5
type Sprite = readonly string[]
type Frame = { eye: string; alt: boolean; tail: boolean; aside: string }

const f = (eye: string, alt: boolean, tail: boolean, aside = ''): Frame => ({ eye, alt, tail, aside })

// `alt` is the second beat: the puppy's legs apart, the senior's tongue out.
const FRAMES: Record<Mood, readonly Frame[]> = {
  sleep: [f('-', false, false, '  z'), f('-', false, false, '   Z'), f('-', false, false, '  zZ')],
  chill: [f('@', false, false), f('@', true, true), f('-', false, false), f('@', true, true)],
  busy: [f('@', true, true, ' .'), f('@', false, false, ' ..'), f('@', true, true, ' ...'), f('@', false, false)],
  cheer: [f('^', true, true, ' *'), f('^', false, false, '  *'), f('^', true, true, ' * *'), f('^', false, true)],
  sweat: [f('@', true, false, ' ;'), f('@', false, false, '  ;'), f('@', true, false, ' ;;'), f('@', false, false)],
  panic: [f('@', true, true, ' !!'), f('@', false, false, ' !'), f('@', true, true, ' !!'), f('@', false, false, '!')],
  dead: [f('x', false, false, ' ~o'), f('x', false, false, '  o~')],
}

const bigHead = ({ eye, alt, aside }: Frame): Sprite => [
  `   / \\__${aside}`,
  `  (    ${eye}\\___`,
  `  /         O`,
  ` /   (_____/`,
  ` /_____/   ${alt ? 'U' : ' '}`,
]

const standing = ({ eye, alt, tail, aside }: Frame): Sprite => {
  const eyes = eye === '@' ? "''" : eye.repeat(2)
  return [
    `    __${aside}`,
    ` o-${eyes}|\\_____/${tail ? '~' : ')'}`,
    `  \\_/|_)     )`,
    `     \\  __  /`,
    eye === '-' || eye === 'x' ? `     (__  (__` : alt ? `    (_/   (_/` : `     (_/ (_/`,
  ]
}

export const sprite = (dog: Dog, mood: Mood, frame: number): Sprite => {
  const frames = FRAMES[mood]
  const pace = dog === 'senior' ? Math.floor(frame / 2) : frame
  const fr = frames[pace % frames.length]!
  return (dog === 'puppy' ? standing(fr) : bigHead(fr)).map(line => line.padEnd(SPRITE_WIDTH))
}

// The puppy frets about the next few hours, the senior about the week.
const QUIPS: Record<Dog, Record<Mood, readonly string[]>> = {
  puppy: {
    sleep: ['쿨쿨…', '불러주면 일어남'],
    chill: ['산책 가고 싶다', '꼬리 살랑', '토큰 넉넉'],
    busy: ['열일 중', '토큰 냠냠', '타닥타닥', '공 물어올게', '머리 굴리는 중'],
    cheer: ['끝! 간식 줘', '칭찬해줘', '왈!'],
    sweat: ['슬슬 아껴 쓰자', '헥헥…', '좀 빡빡한데'],
    panic: ['5h 한도 코앞!', '깨갱!', '아껴! 아껴!'],
    dead: ['방전… 리셋 대기', '낑…'],
  },
  senior: {
    sleep: ['…zzz', '주말 모드'],
    chill: ['이번 주 여유', '느긋하게', '지켜보는 중'],
    busy: ['같이 일하는 중', '장부 정리 중', '주간 예산 체크'],
    cheer: ['잘했다', '흠, 괜찮군'],
    sweat: ['주말까지 버티자', '이번 주 빡빡', '페이스 조절'],
    panic: ['이번 주 거의 끝', '7d 위험!', '진정해…'],
    dead: ['이번 주 끝…', '리셋까지 존버'],
  },
}

export const quip = (dog: Dog, mood: Mood, seed: number): string => {
  const list = QUIPS[dog][mood]
  return list[Math.abs(Math.floor(seed)) % list.length]!
}

export const moodColor = (mood: Mood, calm: string): string =>
  mood === 'panic' || mood === 'dead' ? 'error' : mood === 'sweat' ? 'warning' : calm

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
