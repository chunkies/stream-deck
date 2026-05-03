/**
 * Unit tests for the Dev Console helpers added to marketplace.ts.
 *
 * We test:
 *   1. fmtTs()    — pure timestamp formatter
 *   2. buildLogLine() — DOM builder (no XSS, correct classes/text)
 *
 * window.mp is NOT stubbed here — marketplace.ts guards its init() call with
 * `typeof window.mp !== 'undefined'`, so importing it in jsdom is safe.
 */
import { describe, test, expect } from 'vitest'
import { fmtTs, buildLogLine } from '../../renderer/src/marketplace'
import type { PluginLogEntry } from '../../shared/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<PluginLogEntry> = {}): PluginLogEntry {
  return {
    pluginId: 'demo',
    level:    'info',
    args:     ['hello world'],
    ts:       0,
    ...overrides,
  }
}

// ── fmtTs ──────────────────────────────────────────────────────────────────────

describe('fmtTs', () => {
  test('formats a UTC timestamp as HH:MM:SS with local hours', () => {
    // We can't assert the exact hour (timezone-dependent), but the format must match
    const result = fmtTs(new Date('2025-01-15T14:30:45.000Z').getTime())
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  test('pads single-digit minutes and seconds', () => {
    // Construct a date where local time has M=5, S=3
    const d = new Date()
    d.setHours(9, 5, 3, 0)
    const result = fmtTs(d.getTime())
    expect(result).toMatch(/^\d{2}:05:03$/)
  })

  test('formats midnight correctly', () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    expect(fmtTs(d.getTime())).toMatch(/^00:00:00$/)
  })
})

// ── buildLogLine ───────────────────────────────────────────────────────────────

describe('buildLogLine — structure', () => {
  test('returns a div.mp-log-line element', () => {
    const line = buildLogLine(makeLog())
    expect(line.tagName).toBe('DIV')
    expect(line.classList.contains('mp-log-line')).toBe(true)
  })

  test('contains .mp-log-ts, .mp-log-plugin-id, .mp-log-level, .mp-log-msg children', () => {
    const line = buildLogLine(makeLog())
    expect(line.querySelector('.mp-log-ts')).not.toBeNull()
    expect(line.querySelector('.mp-log-plugin-id')).not.toBeNull()
    expect(line.querySelector('.mp-log-level')).not.toBeNull()
    expect(line.querySelector('.mp-log-msg')).not.toBeNull()
  })

  test('plugin ID shown in .mp-log-plugin-id', () => {
    const line = buildLogLine(makeLog({ pluginId: 'my-plugin' }))
    expect(line.querySelector('.mp-log-plugin-id')!.textContent).toBe('my-plugin')
  })

  test('level badge shows uppercased level text', () => {
    expect(buildLogLine(makeLog({ level: 'info' })).querySelector('.mp-log-level')!.textContent).toBe('INFO')
    expect(buildLogLine(makeLog({ level: 'warn' })).querySelector('.mp-log-level')!.textContent).toBe('WARN')
    expect(buildLogLine(makeLog({ level: 'error' })).querySelector('.mp-log-level')!.textContent).toBe('ERROR')
  })

  test('level badge has correct level class', () => {
    const infoLine  = buildLogLine(makeLog({ level: 'info' }))
    const warnLine  = buildLogLine(makeLog({ level: 'warn' }))
    const errorLine = buildLogLine(makeLog({ level: 'error' }))

    expect(infoLine.querySelector('.mp-log-level')!.classList.contains('mp-log-level-info')).toBe(true)
    expect(warnLine.querySelector('.mp-log-level')!.classList.contains('mp-log-level-warn')).toBe(true)
    expect(errorLine.querySelector('.mp-log-level')!.classList.contains('mp-log-level-error')).toBe(true)
  })
})

describe('buildLogLine — message formatting', () => {
  test('single string arg shown as-is', () => {
    const line = buildLogLine(makeLog({ args: ['hello world'] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe('hello world')
  })

  test('multiple args joined by space', () => {
    const line = buildLogLine(makeLog({ args: ['count:', 42] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe('count: 42')
  })

  test('object args serialised as JSON', () => {
    const line = buildLogLine(makeLog({ args: [{ x: 1 }] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe('{"x":1}')
  })

  test('mixed args: string + number + object', () => {
    const line = buildLogLine(makeLog({ args: ['val', 7, { ok: true }] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe('val 7 {"ok":true}')
  })

  test('empty args array produces empty message', () => {
    const line = buildLogLine(makeLog({ args: [] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe('')
  })
})

describe('buildLogLine — XSS safety', () => {
  test('HTML in plugin ID is not interpreted as markup', () => {
    const xss  = '<script>alert(1)</script>'
    const line = buildLogLine(makeLog({ pluginId: xss }))
    // textContent must equal the raw string — no script tag parsed
    expect(line.querySelector('.mp-log-plugin-id')!.textContent).toBe(xss)
    expect(line.querySelector('script')).toBeNull()
  })

  test('HTML in args is not interpreted as markup', () => {
    const xss  = '<img src=x onerror=alert(1)>'
    const line = buildLogLine(makeLog({ args: [xss] }))
    expect(line.querySelector('.mp-log-msg')!.textContent).toBe(xss)
    expect(line.querySelector('img')).toBeNull()
  })

  test('HTML in level text is not interpreted as markup', () => {
    // level is a controlled union type, but the textContent path must be safe
    const line = buildLogLine(makeLog({ level: 'info' }))
    // We verify no unexpected child elements appear in the level span
    expect(line.querySelector('.mp-log-level')!.children).toHaveLength(0)
  })
})

describe('buildLogLine — stack trace', () => {
  test('entry with stack renders a details.mp-log-stack element', () => {
    const line = buildLogLine(makeLog({ stack: 'Error\n  at line 1' }))
    const details = line.querySelector('details.mp-log-stack')
    expect(details).not.toBeNull()
    expect(details!.querySelector('summary')!.textContent).toBe('Stack trace')
    expect(details!.querySelector('pre')!.textContent).toBe('Error\n  at line 1')
  })

  test('entry without stack does not render a details element', () => {
    const line = buildLogLine(makeLog())
    expect(line.querySelector('details')).toBeNull()
  })
})
