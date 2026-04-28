'use strict'

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn()
}))

const { execSync } = require('child_process')
const { executeCommand, executeBuiltin, executeHotkey, BUILTIN } = require('../server/keyboard')

beforeEach(() => execSync.mockClear())

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
    const key = 'media.playPause'
    executeBuiltin(key)
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
})
