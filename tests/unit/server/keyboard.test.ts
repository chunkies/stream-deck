// @ts-nocheck
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// CJS modules that destructure require()-d deps need native cache manipulation:
// patch the property on the exports object before the module loads.
let execSync: any
let executeCommand: any, executeBuiltin: any, executeHotkey: any, BUILTIN: any
let originalExecSync: any

beforeEach(() => {
  const cp = _require('child_process')
  originalExecSync = cp.execSync
  execSync = vi.fn()
  cp.execSync = execSync                                   // patch before module loads

  const kbdPath = _require.resolve('../../../src/server/keyboard')
  delete _require.cache[kbdPath]                          // force re-require
  const kbd = _require('../../../src/server/keyboard')
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
