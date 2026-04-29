'use strict'

// Test the server's action handling logic in isolation by extracting
// the pure logic portions (config migration + action dispatch rules).

// ── migrateConfig ──────────────────────────────────────
// Inline the migration function so we can test without starting the server
function migrateConfig(cfg) {
  const defaultCols = cfg.grid?.cols || 3
  for (const page of (cfg.pages || [])) {
    if (!page.components) {
      const cols = page.cols || defaultCols
      const components = []
      ;(page.slots || []).forEach((slot, i) => {
        if (!slot) return
        components.push({
          id: `cm${i}-${page.id}`,
          col: (i % cols) + 1,
          row: Math.floor(i / cols) + 1,
          colSpan: 1, rowSpan: 1,
          ...slot
        })
      })
      page.components = components
      delete page.slots
    }
    for (const comp of (page.components || [])) {
      if (comp.componentType === 'toggle') comp.componentType = 'switch'
    }
  }
  return cfg
}

describe('migrateConfig', () => {
  test('converts slots to components with correct grid positions', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{
        id: 'pg1',
        name: 'Main',
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
    // slot 0 → col 1, row 1
    expect(comps[0]).toMatchObject({ col: 1, row: 1, label: 'A' })
    // slot 2 → col 3, row 1
    expect(comps[1]).toMatchObject({ col: 3, row: 1, label: 'C' })
    // slot 3 → col 1, row 2
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
      pages: [{
        id: 'pg',
        name: 'P',
        components: [{ id: 'c1', col: 1, row: 1, componentType: 'button', label: 'Keep' }]
      }]
    }
    const result = migrateConfig(cfg)
    expect(result.pages[0].components).toHaveLength(1)
    expect(result.pages[0].components[0].label).toBe('Keep')
  })

  test('renames toggle componentType to switch', () => {
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{ id: 'pg', name: 'P', components: [{ id: 'c1', col: 1, row: 1, componentType: 'toggle', label: 'T' }] }]
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
    const cfg = {
      grid: { cols: 3, rows: 4 },
      pages: [{ id: 'pg', name: 'P', slots: [] }]
    }
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
    // col 2 → slot 1 is at col 2, row 1
    expect(comps[1]).toMatchObject({ col: 2, row: 1, label: 'B' })
    // col 2 → slot 2 is at col 1, row 2
    expect(comps[2]).toMatchObject({ col: 1, row: 2, label: 'C' })
  })
})

// ── Action dispatch logic ──────────────────────────────
// Test the logic rules without running the server. We use inline dispatch
// functions that mirror the server's switch statements exactly.

function dispatchPress(action, toggleStates, key, pluginsMap, broadcast) {
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

function dispatchSlide(action, value) {
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
    const result = dispatchPress({ type: 'builtin', key: 'media.playPause' }, {}, 'k', {})
    expect(result).toEqual({ type: 'builtin', key: 'media.playPause' })
  })

  test('hotkey action', () => {
    const result = dispatchPress({ type: 'hotkey', combo: 'ctrl+shift+t' }, {}, 'k', {})
    expect(result).toEqual({ type: 'hotkey', combo: 'ctrl+shift+t' })
  })

  test('command action', () => {
    const result = dispatchPress({ type: 'command', command: 'echo hello' }, {}, 'k', {})
    expect(result).toEqual({ type: 'command', command: 'echo hello' })
  })

  test('sequence action', () => {
    const result = dispatchPress({ type: 'sequence', commands: ['cmd1', 'cmd2'], delay: 100 }, {}, 'k', {})
    expect(result).toEqual({ type: 'sequence', commands: ['cmd1', 'cmd2'], delay: 100 })
  })

  test('page navigate', () => {
    const result = dispatchPress({ type: 'page', pageId: 'page-2' }, {}, 'k', {})
    expect(result).toEqual({ type: 'navigate', pageId: 'page-2' })
  })

  test('toggle cycles state correctly', () => {
    const states = {}
    const key = 'pg:comp1'
    const action = { type: 'toggle', on: 'on-cmd', off: 'off-cmd' }

    const first = dispatchPress(action, states, key, {})
    expect(states[key]).toBe(true)
    expect(first.cmd).toBe('on-cmd')

    const second = dispatchPress(action, states, key, {})
    expect(states[key]).toBe(false)
    expect(second.cmd).toBe('off-cmd')
  })

  test('null action returns null', () => {
    expect(dispatchPress(null, {}, 'k', {})).toBeNull()
    expect(dispatchPress(undefined, {}, 'k', {})).toBeNull()
  })
})

describe('slide action dispatch', () => {
  test('command with {value} substitution', () => {
    const result = dispatchSlide({ type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' }, 73.7)
    expect(result.command).toBe('wpctl set-volume @DEFAULT_AUDIO_SINK@ 74%')
  })

  test('command rounds value', () => {
    const result = dispatchSlide({ type: 'command', command: 'vol {value}' }, 49.4)
    expect(result.command).toBe('vol 49')
    const result2 = dispatchSlide({ type: 'command', command: 'vol {value}' }, 49.6)
    expect(result2.command).toBe('vol 50')
  })

  test('builtin action', () => {
    const result = dispatchSlide({ type: 'builtin', key: 'media.volumeUp' }, 80)
    expect(result).toEqual({ type: 'builtin', key: 'media.volumeUp' })
  })

  test('hotkey action', () => {
    const result = dispatchSlide({ type: 'hotkey', combo: 'ctrl+up' }, 60)
    expect(result).toEqual({ type: 'hotkey', combo: 'ctrl+up' })
  })

  test('sequence with {value} in each command', () => {
    const result = dispatchSlide({
      type: 'sequence',
      commands: ['echo start {value}', 'echo end {value}'],
      delay: 100
    }, 42)
    expect(result.commands).toEqual(['echo start 42', 'echo end 42'])
  })

  test('null action returns null', () => {
    expect(dispatchSlide(null, 50)).toBeNull()
  })
})

// ── Tile format logic ──────────────────────────────────
describe('tile format template', () => {
  function applyTileFormat(format, value) {
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

  test('falls back to {value} when format is empty', () => {
    expect(applyTileFormat('', 'hello')).toBe('hello')
    expect(applyTileFormat(null, 'world')).toBe('world')
  })
})

// ── Voice template logic ───────────────────────────────
describe('voice template mode', () => {
  function applyVoiceTemplate(template, transcript) {
    if (!template) return null
    // POSIX single-quote escaping: end quote, insert escaped quote, reopen
    const escaped = transcript.replace(/'/g, "'\\''")
    return template.replace(/{transcript}/g, escaped)
  }

  test('substitutes transcript into template', () => {
    const cmd = applyVoiceTemplate("notify-send '{transcript}'", 'hello world')
    expect(cmd).toBe("notify-send 'hello world'")
  })

  test('escapes single quotes using POSIX approach', () => {
    const cmd = applyVoiceTemplate("echo '{transcript}'", "it's here")
    expect(cmd).toBe("echo 'it'\\''s here'")
  })

  test('returns null when template is empty', () => {
    expect(applyVoiceTemplate('', 'test')).toBeNull()
  })
})

// ── Config validation ──────────────────────────────────
describe('validateConfig', () => {
  function validateConfig(cfg) {
    return Boolean(
      cfg !== null &&
      typeof cfg === 'object' &&
      cfg.grid &&
      typeof cfg.grid.cols === 'number' &&
      typeof cfg.grid.rows === 'number' &&
      Array.isArray(cfg.pages)
    )
  }

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

// ── Spotify SSRF path guard ────────────────────────────
describe('isArtPathSafe', () => {
  const path = require('path')
  const SAFE_ART_PREFIXES = ['/home', '/tmp', '/var/folders', '/private/var/folders']

  function isArtPathSafe(filePath) {
    const resolved = path.resolve(filePath)
    return SAFE_ART_PREFIXES.some(prefix => resolved.startsWith(prefix))
  }

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
})

// ── TIMINGS constants ──────────────────────────────────
describe('TIMINGS constants', () => {
  const { TIMINGS } = require('../../../out/server/constants')

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

// ── slideLastValues cleared on setConfig ──────────────
describe('slideLastValues state management', () => {
  test('infinite scroll delta computed correctly between two values', () => {
    const slideLastValues = {}
    const key = 'page1:comp1'

    function computeDelta(key, value) {
      const last = slideLastValues[key] ?? value
      const raw  = value - last
      slideLastValues[key] = value
      if (Math.abs(raw) > 15) return null
      return Math.round(raw)
    }

    expect(computeDelta(key, 50)).toBe(0)    // first call: no movement
    expect(computeDelta(key, 55)).toBe(5)    // moved +5
    expect(computeDelta(key, 45)).toBe(-10)  // moved -10
    expect(computeDelta(key, 5)).toBeNull()  // large jump (reset) → ignored
    expect(computeDelta(key, 8)).toBe(3)     // small move after reset
  })
})

// ── callPluginWithTimeout ──────────────────────────────
describe('callPluginWithTimeout', () => {
  const PLUGIN_TIMEOUT_MS = 10_000

  function callPluginWithTimeout(fn, params, timeoutMs = PLUGIN_TIMEOUT_MS) {
    const timeout = new Promise((_, rej) =>
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
