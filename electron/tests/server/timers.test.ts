import { describe, test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)

// Import from compiled dist (same pattern as other server tests)
const {
  formatDuration,
  formatTime,
  handleCounterPress,
  handleStopwatchPress,
  handleCountdownPress,
} = _require('../../../dist/electron/server/timers')

// ── formatDuration ─────────────────────────────────────

describe('formatDuration', () => {
  test('formats 0ms as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00')
  })

  test('formats 90 seconds as 01:30', () => {
    expect(formatDuration(90_000)).toBe('01:30')
  })

  test('formats 3661 seconds as 61:01', () => {
    expect(formatDuration(3_661_000)).toBe('61:01')
  })

  test('formats 65500ms with ms as 01:05.50', () => {
    expect(formatDuration(65_500, true)).toBe('01:05.50')
  })

  test('formats 1050ms without ms as 00:01', () => {
    expect(formatDuration(1_050)).toBe('00:01')
  })

  test('formats 1050ms with ms as 00:01.05', () => {
    expect(formatDuration(1_050, true)).toBe('00:01.05')
  })

  test('pads single-digit minutes and seconds', () => {
    expect(formatDuration(5_000)).toBe('00:05')
    expect(formatDuration(65_000)).toBe('01:05')
  })
})

// ── formatTime ─────────────────────────────────────────

describe('formatTime', () => {
  test('formats HH:mm for midnight', () => {
    const d = new Date('2025-01-15T00:30:00')
    expect(formatTime(d, 'HH:mm')).toBe('00:30')
  })

  test('formats HH:mm:ss', () => {
    const d = new Date('2025-01-15T14:05:09')
    expect(formatTime(d, 'HH:mm:ss')).toBe('14:05:09')
  })

  test('12-hour format hh and AM/PM', () => {
    const dAm = new Date('2025-01-15T09:05:00')
    expect(formatTime(dAm, 'hh:mm A')).toBe('09:05 AM')

    const dPm = new Date('2025-01-15T13:05:00')
    expect(formatTime(dPm, 'hh:mm A')).toBe('01:05 PM')
  })

  test('midnight is 12:xx AM in 12-hour', () => {
    const d = new Date('2025-01-15T00:00:00')
    expect(formatTime(d, 'hh:mm A')).toBe('12:00 AM')
  })

  test('noon is 12:xx PM in 12-hour', () => {
    const d = new Date('2025-01-15T12:00:00')
    expect(formatTime(d, 'hh:mm A')).toBe('12:00 PM')
  })

  test('invalid timezone falls back to local', () => {
    const d = new Date('2025-01-15T10:00:00')
    // Should not throw, just use local time
    expect(() => formatTime(d, 'HH:mm', 'Not/A_Timezone')).not.toThrow()
  })
})

// ── handleCounterPress ─────────────────────────────────

describe('handleCounterPress', () => {
  let broadcasts: Array<Record<string, unknown>>
  let broadcast: (msg: Record<string, unknown>) => void

  beforeEach(() => {
    broadcasts = []
    broadcast = (msg) => broadcasts.push(msg)
  })

  test('tap increments value', () => {
    handleCounterPress('p1', 'c1', false, false, { counterMin: 0, counterMax: null, counterStep: 1 }, broadcast)
    expect(broadcasts[0]).toMatchObject({ type: 'tileUpdate', text: '1' })
  })

  test('tap increments by step', () => {
    handleCounterPress('p1', 'c2', false, false, { counterMin: 0, counterMax: null, counterStep: 5 }, broadcast)
    expect(broadcasts[0]).toMatchObject({ text: '5' })
    handleCounterPress('p1', 'c2', false, false, { counterMin: 0, counterMax: null, counterStep: 5 }, broadcast)
    expect(broadcasts[1]).toMatchObject({ text: '10' })
  })

  test('hold decrements value', () => {
    // First set a value
    handleCounterPress('p1', 'c3', false, false, { counterMin: 0, counterMax: null, counterStep: 1 }, broadcast)
    handleCounterPress('p1', 'c3', false, false, { counterMin: 0, counterMax: null, counterStep: 1 }, broadcast)
    // Now hold to decrement
    handleCounterPress('p1', 'c3', true, false, { counterMin: 0, counterMax: null, counterStep: 1 }, broadcast)
    expect(broadcasts[2]).toMatchObject({ text: '1' })
  })

  test('doubletap resets to min', () => {
    handleCounterPress('p1', 'c4', false, false, { counterMin: 5, counterMax: null, counterStep: 1 }, broadcast)
    handleCounterPress('p1', 'c4', false, false, { counterMin: 5, counterMax: null, counterStep: 1 }, broadcast)
    // doubletap resets to min
    handleCounterPress('p1', 'c4', false, true, { counterMin: 5, counterMax: null, counterStep: 1 }, broadcast)
    expect(broadcasts[2]).toMatchObject({ text: '5' })
  })

  test('clamps at max', () => {
    handleCounterPress('p1', 'c5', false, false, { counterMin: 0, counterMax: 2, counterStep: 1 }, broadcast)
    handleCounterPress('p1', 'c5', false, false, { counterMin: 0, counterMax: 2, counterStep: 1 }, broadcast)
    handleCounterPress('p1', 'c5', false, false, { counterMin: 0, counterMax: 2, counterStep: 1 }, broadcast)
    expect(broadcasts[2]).toMatchObject({ text: '2' })
  })

  test('clamps at min when decrementing', () => {
    // Value starts at min (0), hold should not go below 0
    handleCounterPress('p1', 'c6', true, false, { counterMin: 0, counterMax: null, counterStep: 1 }, broadcast)
    expect(broadcasts[0]).toMatchObject({ text: '0' })
  })

  test('broadcasts key = pageId:compId', () => {
    handleCounterPress('myPage', 'myComp', false, false, {}, broadcast)
    expect(broadcasts[0]).toMatchObject({ key: 'myPage:myComp' })
  })
})

// ── handleStopwatchPress ───────────────────────────────

describe('handleStopwatchPress', () => {
  let broadcasts: Array<Record<string, unknown>>
  let broadcast: (msg: Record<string, unknown>) => void

  beforeEach(() => {
    broadcasts = []
    broadcast = (msg) => broadcasts.push(msg)
  })

  test('hold resets stopwatch to 00:00', () => {
    handleStopwatchPress('p1', 'sw1', true, {}, broadcast)
    expect(broadcasts[0]).toMatchObject({ type: 'tileUpdate', text: '00:00' })
  })

  test('hold with showMs resets to 00:00.00', () => {
    handleStopwatchPress('p1', 'sw2', true, { stopwatchShowMs: true }, broadcast)
    expect(broadcasts[0]).toMatchObject({ text: '00:00.00' })
  })

  test('tap starts stopwatch (no immediate broadcast on start)', () => {
    // Starting does not broadcast directly — interval handles it
    const before = broadcasts.length
    handleStopwatchPress('p1', 'sw3', false, {}, broadcast)
    expect(broadcasts.length).toBe(before)
  })

  test('tap then tap stops stopwatch (no broadcast on stop either)', () => {
    handleStopwatchPress('p1', 'sw4', false, {}, broadcast)
    const before = broadcasts.length
    handleStopwatchPress('p1', 'sw4', false, {}, broadcast)
    expect(broadcasts.length).toBe(before)
  })
})

// ── handleCountdownPress ───────────────────────────────

describe('handleCountdownPress', () => {
  let broadcasts: Array<Record<string, unknown>>
  let broadcast: (msg: Record<string, unknown>) => void

  beforeEach(() => {
    broadcasts = []
    broadcast = (msg) => broadcasts.push(msg)
  })

  test('hold resets countdown to full duration', () => {
    handleCountdownPress('p1', 'cd1', true, { duration: 90 }, broadcast)
    expect(broadcasts[0]).toMatchObject({ type: 'tileUpdate', text: '01:30' })
  })

  test('hold with default 60s resets to 01:00', () => {
    handleCountdownPress('p1', 'cd2', true, {}, broadcast)
    expect(broadcasts[0]).toMatchObject({ text: '01:00' })
  })

  test('tap starts countdown (no immediate broadcast)', () => {
    const before = broadcasts.length
    handleCountdownPress('p1', 'cd3', false, { duration: 60 }, broadcast)
    expect(broadcasts.length).toBe(before)
  })

  test('tap then tap pauses countdown', () => {
    handleCountdownPress('p1', 'cd4', false, { duration: 60 }, broadcast)
    const before = broadcasts.length
    handleCountdownPress('p1', 'cd4', false, { duration: 60 }, broadcast)
    expect(broadcasts.length).toBe(before)
  })
})
