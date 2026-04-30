import { vi, describe, test, expect } from 'vitest'
import type { Action } from '../../shared/types'

// ── Real module imports ────────────────────────────────
// These test the actual compiled production code, not local copies.
const { migrateConfig, validateConfig } = require('../../../dist/electron/server/config')
const { isArtPathSafe }                 = require('../../../dist/electron/server/spotify')
const { TIMINGS }                       = require('../../../dist/electron/server/constants')

// ── migrateConfig ──────────────────────────────────────
describe('migrateConfig', () => {
  test('converts slots to components with correct grid positions', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{
        id: 'pg1', name: 'Main',
        slots: [
          { componentType: 'button', label: 'A' },
          null,
          { componentType: 'button', label: 'C' },
          { componentType: 'slider', label: 'D' }
        ]
      }]
    }
    const result = migrateConfig(cfg)
    const comps = result.pages[0].components
    expect(comps).toHaveLength(3)
    expect(comps[0]).toMatchObject({ col: 1, row: 1, label: 'A' })
    expect(comps[1]).toMatchObject({ col: 3, row: 1, label: 'C' })
    expect(comps[2]).toMatchObject({ col: 1, row: 2, label: 'D' })
  })

  test('skips null slots', () => {
    const cfg = {
      grid: { cols: 2, rows: 2 },
      pages: [{ id: 'pg', name: 'P', slots: [null, null, { componentType: 'button', label: 'X' }] }]
    }
    const result = migrateConfig(cfg)
    expect(result.pages[0].components).toHaveLength(1)
    expect(result.pages[0].components[0].label).toBe('X')
  })

  test('does not re-migrate pages that already have components', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{ id: 'pg', name: 'P', components: [{ id: 'c1', col: 1, row: 1, componentType: 'button', label: 'Keep', colSpan: 1, rowSpan: 1 }] }]
    }
    const result = migrateConfig(cfg)
    expect(result.pages[0].components).toHaveLength(1)
    expect(result.pages[0].components[0].label).toBe('Keep')
  })

  test('renames toggle componentType to switch', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{ id: 'pg', name: 'P', components: [{ id: 'c1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'toggle', label: 'T' }] }]
    }
    const result = migrateConfig(cfg)
    expect(result.pages[0].components[0].componentType).toBe('switch')
  })

  test('deletes slots array after migration', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{ id: 'pg', name: 'P', slots: [{ componentType: 'button', label: 'A' }] }]
    }
    const result = migrateConfig(cfg)
    expect(result.pages[0].slots).toBeUndefined()
  })

  test('handles empty slots array', () => {
    const cfg = { grid: { cols: 3, rows: 4 }, pages: [{ id: 'pg', name: 'P', slots: [] }] }
    const result = migrateConfig(cfg)
    expect(result.pages[0].components).toEqual([])
  })

  test('respects per-page cols override', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{
        id: 'pg', name: 'P', cols: 2,
        slots: [
          { componentType: 'button', label: 'A' },
          { componentType: 'button', label: 'B' },
          { componentType: 'button', label: 'C' }
        ]
      }]
    }
    const result = migrateConfig(cfg)
    const comps = result.pages[0].components
    expect(comps[1]).toMatchObject({ col: 2, row: 1, label: 'B' })
    expect(comps[2]).toMatchObject({ col: 1, row: 2, label: 'C' })
  })
})

// ── validateConfig ────────────────────────────────────
describe('validateConfig', () => {
  test('accepts a valid config', () => {
    expect(validateConfig({ grid: { cols: 3, rows: 4 }, pages: [] })).toBe(true)
  })

  test('rejects null', () => {
    expect(validateConfig(null)).toBe(false)
  })

  test('rejects config without grid', () => {
    expect(validateConfig({ pages: [] })).toBe(false)
  })

  test('rejects config with non-array pages', () => {
    expect(validateConfig({ grid: { cols: 3, rows: 4 }, pages: {} })).toBe(false)
  })

  test('rejects config with string grid dimensions', () => {
    expect(validateConfig({ grid: { cols: '3', rows: '4' }, pages: [] })).toBe(false)
  })
})

// ── isArtPathSafe ─────────────────────────────────────
describe('isArtPathSafe', () => {
  test('allows paths in /home', () => {
    expect(isArtPathSafe('/home/user/.cache/spotify/art.jpg')).toBe(true)
  })

  test('allows paths in /tmp', () => {
    expect(isArtPathSafe('/tmp/spotify-art.jpg')).toBe(true)
  })

  test('rejects /etc/passwd', () => {
    expect(isArtPathSafe('/etc/passwd')).toBe(false)
  })

  test('rejects path traversal escape from /tmp', () => {
    expect(isArtPathSafe('/tmp/../etc/shadow')).toBe(false)
  })

  test('rejects /root', () => {
    expect(isArtPathSafe('/root/.ssh/id_rsa')).toBe(false)
  })

  test('rejects empty string', () => {
    expect(isArtPathSafe('')).toBe(false)
  })
})

// ── TIMINGS constants ──────────────────────────────────
describe('TIMINGS constants', () => {
  test('PLUGIN_TIMEOUT_MS is a finite positive number', () => {
    expect(typeof TIMINGS.PLUGIN_TIMEOUT_MS).toBe('number')
    expect(TIMINGS.PLUGIN_TIMEOUT_MS).toBeGreaterThan(0)
    expect(isFinite(TIMINGS.PLUGIN_TIMEOUT_MS)).toBe(true)
  })

  test('PLUGIN_TIMEOUT does not exist (typo guard)', () => {
    expect(TIMINGS.PLUGIN_TIMEOUT).toBeUndefined()
  })

  test('all expected keys are present and positive', () => {
    const required = ['PLUGIN_TIMEOUT_MS', 'TILE_POLL_MIN_MS', 'TILE_POLL_CMD_MS', 'SPOTIFY_POLL_MS', 'COMMAND_TIMEOUT_MS', 'SEQUENCE_DEFAULT_MS']
    for (const key of required) {
      expect(TIMINGS[key]).toBeGreaterThan(0)
    }
  })
})

// ── Action dispatch logic ──────────────────────────────
// Note: handlePress/handleSlide are internal to server/index.ts and not exported.
// These tests verify the dispatch logic in isolation using local equivalents
// that mirror the switch structure exactly. If the switch cases in index.ts
// change, update these in lockstep.
type DispatchResult = Record<string, unknown> | null

function dispatchPress(
  action: Action | null | undefined,
  toggleStates: Record<string, boolean>,
  key: string,
): DispatchResult {
  if (!action) return null
  switch (action.type) {
    case 'builtin':  return { type: 'builtin',  key: action.key }
    case 'hotkey':   return { type: 'hotkey',   combo: action.combo }
    case 'command':  return { type: 'command',  command: action.command }
    case 'sequence': return { type: 'sequence', commands: action.commands, delay: action.delay }
    case 'page':     return { type: 'navigate', pageId: action.pageId }
    case 'toggle': {
      toggleStates[key] = !toggleStates[key]
      const active = toggleStates[key]
      return { type: 'toggle', active, cmd: active ? action.on : action.off }
    }
    default: return null
  }
}

function dispatchSlide(action: Action | null | undefined, value: number): DispatchResult {
  if (!action) return null
  const val = String(Math.round(value))
  switch (action.type) {
    case 'command':  return { type: 'command',  command: action.command.replace(/{value}/g, val) }
    case 'builtin':  return { type: 'builtin',  key: action.key }
    case 'hotkey':   return { type: 'hotkey',   combo: action.combo }
    case 'sequence': return { type: 'sequence', commands: action.commands.map(c => c.replace(/{value}/g, val)) }
    default: return null
  }
}

describe('press action dispatch', () => {
  test('builtin action', () => {
    expect(dispatchPress({ type: 'builtin', key: 'media.playPause' }, {}, 'k'))
      .toEqual({ type: 'builtin', key: 'media.playPause' })
  })

  test('hotkey action', () => {
    expect(dispatchPress({ type: 'hotkey', combo: 'ctrl+shift+t' }, {}, 'k'))
      .toEqual({ type: 'hotkey', combo: 'ctrl+shift+t' })
  })

  test('command action', () => {
    expect(dispatchPress({ type: 'command', command: 'echo hello' }, {}, 'k'))
      .toEqual({ type: 'command', command: 'echo hello' })
  })

  test('sequence action', () => {
    expect(dispatchPress({ type: 'sequence', commands: ['cmd1', 'cmd2'], delay: 100 }, {}, 'k'))
      .toEqual({ type: 'sequence', commands: ['cmd1', 'cmd2'], delay: 100 })
  })

  test('page navigate', () => {
    expect(dispatchPress({ type: 'page', pageId: 'page-2' }, {}, 'k'))
      .toEqual({ type: 'navigate', pageId: 'page-2' })
  })

  test('toggle cycles state correctly', () => {
    const states: Record<string, boolean> = {}
    const key = 'pg:comp1'
    const action: Action = { type: 'toggle', on: 'on-cmd', off: 'off-cmd' }

    const first = dispatchPress(action, states, key) as Record<string, unknown>
    expect(states[key]).toBe(true)
    expect(first.cmd).toBe('on-cmd')

    const second = dispatchPress(action, states, key) as Record<string, unknown>
    expect(states[key]).toBe(false)
    expect(second.cmd).toBe('off-cmd')
  })

  test('null/undefined action returns null', () => {
    expect(dispatchPress(null,      {}, 'k')).toBeNull()
    expect(dispatchPress(undefined, {}, 'k')).toBeNull()
  })
})

describe('slide action dispatch', () => {
  test('command with {value} substitution', () => {
    const r = dispatchSlide({ type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' }, 73.7) as Record<string, unknown>
    expect(r.command).toBe('wpctl set-volume @DEFAULT_AUDIO_SINK@ 74%')
  })

  test('command rounds value', () => {
    expect((dispatchSlide({ type: 'command', command: 'vol {value}' }, 49.4) as Record<string, unknown>).command).toBe('vol 49')
    expect((dispatchSlide({ type: 'command', command: 'vol {value}' }, 49.6) as Record<string, unknown>).command).toBe('vol 50')
  })

  test('builtin action', () => {
    expect(dispatchSlide({ type: 'builtin', key: 'media.volumeUp' }, 80))
      .toEqual({ type: 'builtin', key: 'media.volumeUp' })
  })

  test('hotkey action', () => {
    expect(dispatchSlide({ type: 'hotkey', combo: 'ctrl+up' }, 60))
      .toEqual({ type: 'hotkey', combo: 'ctrl+up' })
  })

  test('sequence with {value} in each command', () => {
    const r = dispatchSlide({ type: 'sequence', commands: ['echo start {value}', 'echo end {value}'], delay: 100 }, 42) as Record<string, unknown>
    expect(r.commands).toEqual(['echo start 42', 'echo end 42'])
  })

  test('null action returns null', () => {
    expect(dispatchSlide(null, 50)).toBeNull()
  })
})

// ── Tile format template ───────────────────────────────
describe('tile format template', () => {
  function applyTileFormat(format: string | null | undefined, value: string): string {
    return (format || '{value}').replace(/{value}/g, value)
  }

  test('default format just shows value', () => {
    expect(applyTileFormat('{value}', '42')).toBe('42')
  })

  test('wraps value in custom template', () => {
    expect(applyTileFormat('CPU: {value}%', '73')).toBe('CPU: 73%')
  })

  test('replaces all occurrences', () => {
    expect(applyTileFormat('{value} / {value}', '10')).toBe('10 / 10')
  })

  test('falls back to {value} when format is empty/null', () => {
    expect(applyTileFormat('', 'hello')).toBe('hello')
    expect(applyTileFormat(null, 'world')).toBe('world')
  })
})

// ── Voice template mode ────────────────────────────────
describe('voice template mode', () => {
  function applyVoiceTemplate(template: string | null | undefined, transcript: string): string | null {
    if (!template) return null
    const escaped = transcript.replace(/'/g, "'\\''")
    return template.replace(/{transcript}/g, escaped)
  }

  test('substitutes transcript into template', () => {
    expect(applyVoiceTemplate("notify-send '{transcript}'", 'hello world')).toBe("notify-send 'hello world'")
  })

  test('escapes single quotes using POSIX approach', () => {
    expect(applyVoiceTemplate("echo '{transcript}'", "it's here")).toBe("echo 'it'\\''s here'")
  })

  test('returns null when template is empty', () => {
    expect(applyVoiceTemplate('', 'test')).toBeNull()
  })
})

// ── Infinite scroll delta logic ────────────────────────
describe('slideLastValues state management', () => {
  test('infinite scroll delta computed correctly between two values', () => {
    const slideLastValues: Record<string, number> = {}
    const key = 'page1:comp1'

    function computeDelta(k: string, value: number): number | null {
      const last = slideLastValues[k] ?? value
      const raw  = value - last
      slideLastValues[k] = value
      if (Math.abs(raw) > 15) return null
      return Math.round(raw)
    }

    expect(computeDelta(key, 50)).toBe(0)
    expect(computeDelta(key, 55)).toBe(5)
    expect(computeDelta(key, 45)).toBe(-10)
    expect(computeDelta(key, 5)).toBeNull()
    expect(computeDelta(key, 8)).toBe(3)
  })
})

// ── Plugin action timeout ──────────────────────────────
describe('callPluginWithTimeout', () => {
  const PLUGIN_TIMEOUT_MS = 10_000

  function callPluginWithTimeout(
    fn: (params: unknown) => unknown,
    params: unknown,
    timeoutMs = PLUGIN_TIMEOUT_MS
  ): Promise<unknown> {
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Plugin action timed out')), timeoutMs)
    )
    return Promise.race([Promise.resolve().then(() => fn(params)), timeout])
  }

  test('resolves when fn completes quickly', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(callPluginWithTimeout(fn, { x: 1 }, 500)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledWith({ x: 1 })
  })

  test('rejects when fn times out', async () => {
    const fn = vi.fn(() => new Promise(resolve => setTimeout(resolve, 200)))
    await expect(callPluginWithTimeout(fn, {}, 50)).rejects.toThrow('Plugin action timed out')
  })

  test('propagates fn rejection', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('plugin crashed'))
    await expect(callPluginWithTimeout(fn, {}, 500)).rejects.toThrow('plugin crashed')
  })
})
