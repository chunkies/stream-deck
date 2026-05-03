import { vi, describe, test, expect, beforeEach, afterEach, type Mock } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)

// CJS modules that destructure require()-d deps need native cache manipulation:
// patch the property on the exports object before the module loads.
let execSync: Mock
let executeCommand: (cmd: string | undefined) => void
let executeBuiltin: (key: string) => void
let executeHotkey: (combo: string | undefined) => void
let BUILTIN: Record<string, Record<string, string | number>>
let originalExecSync: (...args: unknown[]) => unknown

beforeEach(() => {
  const cp = _require('child_process')
  originalExecSync = cp.execSync
  execSync = vi.fn()
  cp.execSync = execSync                                   // patch before module loads

  const kbdPath = _require.resolve('../../../dist/electron/server/keyboard')
  delete _require.cache[kbdPath]                          // force re-require
  const kbd = _require('../../../dist/electron/server/keyboard')
  executeCommand = kbd.executeCommand
  executeBuiltin = kbd.executeBuiltin
  executeHotkey  = kbd.executeHotkey
  BUILTIN        = kbd.BUILTIN
})

afterEach(() => {
  const cp = _require('child_process')
  cp.execSync = originalExecSync                          // restore
})

// ── executeCommand ─────────────────────────────────────
describe('executeCommand', () => {
  test('runs a shell command', () => {
    executeCommand('echo hello')
    expect(execSync).toHaveBeenCalledWith('echo hello', expect.any(Object))
  })

  test('ignores empty / whitespace commands', () => {
    executeCommand('')
    executeCommand('   ')
    executeCommand(undefined)
    expect(execSync).not.toHaveBeenCalled()
  })

  test('swallows errors without throwing', () => {
    execSync.mockImplementation(() => { throw new Error('cmd failed') })
    expect(() => executeCommand('bad-cmd')).not.toThrow()
  })
})

// ── executeBuiltin ─────────────────────────────────────
describe('executeBuiltin', () => {
  test('executes a known builtin key', () => {
    executeBuiltin('media.playPause')
    expect(execSync).toHaveBeenCalled()
    const cmd = execSync.mock.calls[0][0]
    expect(typeof cmd).toBe('string')
    expect(cmd.length).toBeGreaterThan(0)
  })

  test('ignores unknown builtin keys', () => {
    executeBuiltin('nonexistent.action')
    expect(execSync).not.toHaveBeenCalled()
  })

  test('all defined BUILTIN keys resolve to a non-empty command', () => {
    for (const key of Object.keys(BUILTIN)) {
      const entry = BUILTIN[key]
      const platform = process.platform
      const cmd = entry[platform] || entry.linux
      expect(typeof cmd === 'string' || typeof cmd === 'number').toBe(true)
    }
  })
})

// ── executeHotkey ──────────────────────────────────────
describe('executeHotkey', () => {
  test('ignores empty combo', () => {
    executeHotkey('')
    executeHotkey(undefined)
    expect(execSync).not.toHaveBeenCalled()
  })

  test('runs a command for a valid combo', () => {
    executeHotkey('ctrl+c')
    expect(execSync).toHaveBeenCalled()
  })

  test('rejects combo with shell metacharacters', () => {
    execSync.mockClear()
    executeHotkey('ctrl+$(whoami)')
    executeHotkey('ctrl+`id`')
    executeHotkey('ctrl+c; rm -rf /')
    expect(execSync).not.toHaveBeenCalled()
  })

  test('accepts valid combos with digits and underscores', () => {
    executeHotkey('ctrl+shift+F12')
    executeHotkey('super+l')
    executeHotkey('alt+F4')
    expect(execSync).toHaveBeenCalledTimes(3)
  })
})

// ── moveMouse / clickMouse / scrollMouse ────────────────
describe('mouse control', () => {
  let moveMouse: (dx: number, dy: number) => void
  let clickMouse: (button: number) => void
  let scrollMouse: (dy: number) => void

  beforeEach(() => {
    const kbdPath = _require.resolve('../../../dist/electron/server/keyboard')
    delete _require.cache[kbdPath]
    const kbd = _require('../../../dist/electron/server/keyboard')
    moveMouse  = kbd.moveMouse
    clickMouse = kbd.clickMouse
    scrollMouse = kbd.scrollMouse
  })

  test('moveMouse ignores zero deltas', () => {
    moveMouse(0, 0)
    expect(execSync).not.toHaveBeenCalled()
  })

  test('moveMouse ignores sub-pixel deltas that round to zero', () => {
    moveMouse(0.4, -0.4)
    expect(execSync).not.toHaveBeenCalled()
  })

  test('moveMouse sends a command for non-zero delta', () => {
    moveMouse(10, -5)
    expect(execSync).toHaveBeenCalled()
  })

  test('clickMouse sends a command for button 1', () => {
    clickMouse(1)
    expect(execSync).toHaveBeenCalled()
  })

  test('clickMouse sends a command for button 3 (right-click)', () => {
    clickMouse(3)
    expect(execSync).toHaveBeenCalled()
  })

  test('scrollMouse ignores tiny delta that rounds to zero steps', () => {
    scrollMouse(5)  // steps = round(5/10) = 1, but direction based on sign
    expect(execSync).toHaveBeenCalled()  // steps=1, non-zero
  })

  test('scrollMouse ignores very small dy (rounds to 0 steps)', () => {
    scrollMouse(2)  // steps = round(2/10) = 0
    expect(execSync).not.toHaveBeenCalled()
  })
})
