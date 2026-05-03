import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)

const { matchField, matchesCron, startCrons, stopCrons } = _require('../../../dist/electron/server/cron') as {
  matchField:   (field: string, value: number) => boolean
  matchesCron:  (cron: string, date: Date) => boolean
  startCrons:   (getConfig: () => unknown, runAction: (pageId: string, compId: string) => void) => void
  stopCrons:    () => void
}

// ── matchField ─────────────────────────────────────────

describe('matchField', () => {
  test('wildcard * always matches', () => {
    expect(matchField('*', 0)).toBe(true)
    expect(matchField('*', 59)).toBe(true)
  })

  test('exact value matches when equal', () => {
    expect(matchField('30', 30)).toBe(true)
    expect(matchField('5', 5)).toBe(true)
  })

  test('exact value does not match when different', () => {
    expect(matchField('30', 31)).toBe(false)
    expect(matchField('0', 1)).toBe(false)
  })

  test('step */5 matches multiples of 5', () => {
    expect(matchField('*/5', 0)).toBe(true)
    expect(matchField('*/5', 5)).toBe(true)
    expect(matchField('*/5', 30)).toBe(true)
    expect(matchField('*/5', 55)).toBe(true)
  })

  test('step */5 does not match non-multiples', () => {
    expect(matchField('*/5', 1)).toBe(false)
    expect(matchField('*/5', 7)).toBe(false)
    expect(matchField('*/5', 31)).toBe(false)
  })

  test('step */15 matches 0, 15, 30, 45', () => {
    expect(matchField('*/15', 0)).toBe(true)
    expect(matchField('*/15', 15)).toBe(true)
    expect(matchField('*/15', 30)).toBe(true)
    expect(matchField('*/15', 45)).toBe(true)
    expect(matchField('*/15', 14)).toBe(false)
  })

  test('invalid step returns false', () => {
    expect(matchField('*/0', 0)).toBe(false)
    expect(matchField('*/abc', 5)).toBe(false)
  })
})

// ── matchesCron ────────────────────────────────────────

describe('matchesCron', () => {
  test('*/5 * * * * matches when minute is multiple of 5', () => {
    const date = new Date('2025-01-15T10:30:00')   // minute=30, hour=10
    expect(matchesCron('*/5 * * * *', date)).toBe(true)
  })

  test('*/5 * * * * does not match when minute is not multiple of 5', () => {
    const date = new Date('2025-01-15T10:31:00')   // minute=31
    expect(matchesCron('*/5 * * * *', date)).toBe(false)
  })

  test('specific minute and hour matches', () => {
    const date = new Date('2025-01-15T09:00:00')   // minute=0, hour=9
    expect(matchesCron('0 9 * * *', date)).toBe(true)
  })

  test('specific minute and hour does not match wrong hour', () => {
    const date = new Date('2025-01-15T10:00:00')   // minute=0, hour=10
    expect(matchesCron('0 9 * * *', date)).toBe(false)
  })

  test('wrong field count returns false', () => {
    const date = new Date()
    expect(matchesCron('* * * *', date)).toBe(false)
    expect(matchesCron('* * * * * *', date)).toBe(false)
  })

  test('fully specific expression matches correct date', () => {
    // Jan 15 2025 is a Wednesday (day 3); 14:30
    const date = new Date('2025-01-15T14:30:00')
    expect(matchesCron('30 14 15 1 3', date)).toBe(true)
  })

  test('fully specific expression does not match wrong weekday', () => {
    const date = new Date('2025-01-15T14:30:00')   // Wednesday=3
    expect(matchesCron('30 14 15 1 2', date)).toBe(false)   // 2 = Tuesday
  })

  test('month field uses 1-based indexing', () => {
    const date = new Date('2025-06-01T00:00:00')   // June = month 6
    expect(matchesCron('0 0 1 6 *', date)).toBe(true)
    expect(matchesCron('0 0 1 7 *', date)).toBe(false)
  })
})

// ── startCrons / stopCrons ─────────────────────────────

describe('startCrons', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopCrons()
  })

  afterEach(() => {
    stopCrons()
    vi.useRealTimers()
  })

  test('does not call runAction for disabled trigger', () => {
    const runAction = vi.fn()
    const config = {
      pages: [],
      grid: { cols: 3, rows: 4 },
      crons: [{ id: 'c1', cron: '* * * * *', pageId: 'p1', compId: 'b1', enabled: false }],
    }

    // Freeze time to a minute boundary so the cron would otherwise fire
    vi.setSystemTime(new Date('2025-01-15T10:00:00.000'))
    startCrons(() => config, runAction)
    vi.advanceTimersByTime(60_000)
    expect(runAction).not.toHaveBeenCalled()
  })

  test('calls runAction for enabled trigger when cron matches', () => {
    const runAction = vi.fn()
    // Start at 10:59:00 — after the 60s tick, time is 11:00:00 (minute=0) → matches '0 * * * *'
    vi.setSystemTime(new Date('2025-01-15T10:59:00.000'))
    const config = {
      pages: [],
      grid: { cols: 3, rows: 4 },
      crons: [{ id: 'c2', cron: '0 * * * *', pageId: 'p2', compId: 'b2', enabled: true }],
    }
    startCrons(() => config, runAction)
    vi.advanceTimersByTime(60_000)
    expect(runAction).toHaveBeenCalledWith('p2', 'b2')
  })

  test('does not call runAction when cron does not match', () => {
    const runAction = vi.fn()
    // Time: 10:31 → '0 * * * *' does NOT match (minute=31)
    vi.setSystemTime(new Date('2025-01-15T10:31:00.000'))
    const config = {
      pages: [],
      grid: { cols: 3, rows: 4 },
      crons: [{ id: 'c3', cron: '0 * * * *', pageId: 'p3', compId: 'b3', enabled: true }],
    }
    startCrons(() => config, runAction)
    vi.advanceTimersByTime(60_000)
    expect(runAction).not.toHaveBeenCalled()
  })

  test('stopCrons prevents further firing', () => {
    const runAction = vi.fn()
    vi.setSystemTime(new Date('2025-01-15T10:00:00.000'))
    const config = {
      pages: [],
      grid: { cols: 3, rows: 4 },
      crons: [{ id: 'c4', cron: '0 * * * *', pageId: 'p4', compId: 'b4', enabled: true }],
    }
    startCrons(() => config, runAction)
    stopCrons()
    vi.advanceTimersByTime(60_000)
    expect(runAction).not.toHaveBeenCalled()
  })

  test('handles config with no crons array gracefully', () => {
    const runAction = vi.fn()
    vi.setSystemTime(new Date('2025-01-15T10:00:00.000'))
    const config = { pages: [], grid: { cols: 3, rows: 4 } }
    expect(() => {
      startCrons(() => config as never, runAction)
      vi.advanceTimersByTime(60_000)
    }).not.toThrow()
    expect(runAction).not.toHaveBeenCalled()
  })
})
