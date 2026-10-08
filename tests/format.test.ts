import { test, expect } from 'claude-code/testing'
import {
  burnEta, cacheHit, effortColor, SPRITE_ROWS, SPRITE_WIDTH, sprite, formatClock, formatRemaining, gauge, hasReset,
  labelFor, levelOf, moodOf, parseGitStatus, shortModel, sortLimits,
} from '../hooks/lib'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

test('labels, levels, gauges', () => {
  expect(labelFor('seven_day_fable')).toBe('7d fable')
  expect(levelOf(8)).toBe('success')
  expect(levelOf(63)).toBe('warning')
  expect(levelOf(92)).toBe('error')
  expect(gauge(63)).toEqual([6, 4])
  expect(gauge(140)).toEqual([10, 0])
})

test('orders 5h before 7d before others', () => {
  const kinds = sortLimits([
    { kind: 'seven_day_fable', percentUsed: 1 },
    { kind: 'seven_day', percentUsed: 1 },
    { kind: 'five_hour', percentUsed: 1 },
  ]).map(r => r.kind)
  expect(kinds).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
})

test('times', () => {
  expect(formatRemaining(iso(NOW + 2 * HOUR + 14 * 60_000), NOW)).toBe('2h14m')
  expect(formatClock(134_000)).toBe('2m14s')
  expect(formatClock(9_000)).toBe('9s')
  expect(hasReset({ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW - 1) }, NOW)).toBe(true)
})

test('burn ETA: dry before reset at the average pace', () => {
  // 3h into the 5h window, 75% used → 25% left at 25%/h → 1h, before the 2h reset
  expect(burnEta({ kind: 'five_hour', percentUsed: 75, resetsAt: iso(NOW + 2 * HOUR) }, NOW)).toBe(HOUR)
  // 3h in, 30% used → would last 7h more, but resets in 2h → safe
  expect(burnEta({ kind: 'five_hour', percentUsed: 30, resetsAt: iso(NOW + 2 * HOUR) }, NOW)).toBe(undefined)
})

test('cache hit rate', () => {
  expect(cacheHit({ input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 })).toBe(90)
  expect(cacheHit({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(undefined)
})

test('parses git status', () => {
  const g = parseGitStatus('## main...origin/main [ahead 2, behind 1]\nM  a.md\n M b.md\nMM c.md\n?? d.md\n')
  expect(g).toEqual({ branch: 'main', ahead: 2, behind: 1, staged: 2, modified: 2, untracked: 1 })
  expect(parseGitStatus('## feature\n').branch).toBe('feature')
})

test('models, effort, mascot', () => {
  expect(shortModel('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(effortColor('max')).toBe('claude')
  expect(moodOf(92, false)).toBe('panic')
  expect(moodOf(10, true)).toBe('busy')
  expect(sprite('senior', 'chill', 0)[1]?.trimEnd()).toBe('  (    @\\___')
  expect(sprite('puppy', 'sleep', 0)[1]?.trimEnd()).toBe(' o---|\\_____/)')
  expect(sprite('puppy', 'busy', 0).length).toBe(SPRITE_ROWS)
  for (const mood of ['sleep', 'chill', 'busy', 'cheer', 'sweat', 'panic', 'dead'] as const) {
    for (const dog of ['puppy', 'senior'] as const) for (let f = 0; f < 4; f++) for (const line of sprite(dog, mood, f)) expect(line.length).toBe(SPRITE_WIDTH)
  }
})
