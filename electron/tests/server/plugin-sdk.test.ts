import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import fs   from 'fs'
import path from 'path'
import os   from 'os'

const _require = createRequire(__filename)

let execSync: any, exec: any, createSDK: any
let origExecSync: any, origExec: any
let tmpDir: string
let broadcastSpy: any

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-test-'))
  broadcastSpy = vi.fn()

  const cp = _require('child_process')
  origExecSync = cp.execSync
  origExec     = cp.exec
  execSync = vi.fn(() => 'output')
  exec     = vi.fn()
  cp.execSync = execSync
  cp.exec     = exec

  const sdkPath = _require.resolve('../../../dist/electron/server/plugin-sdk')
  delete _require.cache[sdkPath]
  const sdk = _require('../../../dist/electron/server/plugin-sdk')
  createSDK = sdk.createSDK
})

afterEach(() => {
  const cp = _require('child_process')
  cp.execSync = origExecSync
  cp.exec     = origExec
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── shell ──────────────────────────────────────────────
describe('sdk.shell.exec', () => {
  test('calls execSync and returns trimmed string', () => {
    execSync.mockReturnValue(Buffer.from('  hello  '))
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const result = sdk.shell.exec('echo hello')
    expect(result).toBe('hello')
    expect(execSync).toHaveBeenCalledWith('echo hello', expect.objectContaining({ timeout: 5000 }))
  })
})

describe('sdk.shell.execAsync', () => {
  test('resolves with trimmed output on success', async () => {
    exec.mockImplementation((_cmd: unknown, _opts: unknown, cb: (err: null, out: string) => void) => cb(null, '  async output  '))
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const result = await sdk.shell.execAsync('echo hi')
    expect(result).toBe('async output')
  })

  test('rejects on error', async () => {
    exec.mockImplementation((_cmd: unknown, _opts: unknown, cb: (err: Error) => void) => cb(new Error('fail')))
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    await expect(sdk.shell.execAsync('bad')).rejects.toThrow('fail')
  })
})

// ── storage ────────────────────────────────────────────
describe('sdk.storage', () => {
  test('set and get a value', () => {
    const sdk = createSDK('myplugin', tmpDir, broadcastSpy)
    sdk.storage.set('key1', 'value1')
    expect(sdk.storage.get('key1')).toBe('value1')
  })

  test('get without key returns all data', () => {
    const sdk = createSDK('myplugin', tmpDir, broadcastSpy)
    sdk.storage.set('a', 1)
    sdk.storage.set('b', 2)
    expect(sdk.storage.get()).toEqual({ a: 1, b: 2 })
  })

  test('delete removes a key', () => {
    const sdk = createSDK('myplugin', tmpDir, broadcastSpy)
    sdk.storage.set('k', 'v')
    sdk.storage.delete('k')
    expect(sdk.storage.get('k')).toBeUndefined()
  })

  test('clear wipes all data', () => {
    const sdk = createSDK('myplugin', tmpDir, broadcastSpy)
    sdk.storage.set('x', 99)
    sdk.storage.clear()
    expect(sdk.storage.get()).toEqual({})
  })

  test('get returns undefined for missing key (no file)', () => {
    const sdk = createSDK('fresh-plugin', tmpDir, broadcastSpy)
    expect(sdk.storage.get('missing')).toBeUndefined()
  })

  test('persists across SDK instances', () => {
    const sdk1 = createSDK('persist', tmpDir, broadcastSpy)
    sdk1.storage.set('saved', 'data')
    const sdk2 = createSDK('persist', tmpDir, broadcastSpy)
    expect(sdk2.storage.get('saved')).toBe('data')
  })
})

// ── broadcast ──────────────────────────────────────────
describe('sdk.broadcast', () => {
  test('wraps event with pluginId and type', () => {
    const sdk = createSDK('my-plugin', tmpDir, broadcastSpy)
    sdk.broadcast({ event: 'cpu', value: 42 })
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: 'pluginEvent',
      pluginId: 'my-plugin',
      event: 'cpu',
      value: 42
    })
  })
})

// ── on/emit ────────────────────────────────────────────
describe('sdk.on / sdk.emit', () => {
  test('registered handler is called on emit', async () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const handler = vi.fn()
    sdk.on('myPlugin.doThing', handler)
    await sdk.emit('myPlugin.doThing', { value: 10 })
    expect(handler).toHaveBeenCalledWith({ value: 10 })
  })

  test('unregistered key does nothing', async () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    await expect(sdk.emit('nonexistent', {})).resolves.toBeUndefined()
  })
})

// ── tile ───────────────────────────────────────────────
describe('sdk.tile', () => {
  test('tile.set broadcasts tileUpdate with key and opts', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    sdk.tile.set('page-1', 'btn-a', { text: '42', color: '#ff0000' })
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: 'tileUpdate', key: 'page-1:btn-a', text: '42', color: '#ff0000'
    })
  })

  test('tile.flash broadcasts tileFlash with default 500ms', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    sdk.tile.flash('page-1', 'btn-b', '#00ff00')
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: 'tileFlash', key: 'page-1:btn-b', color: '#00ff00', ms: 500
    })
  })

  test('tile.flash accepts custom duration', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    sdk.tile.flash('pg', 'comp', '#ffffff', 1000)
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ ms: 1000 }))
  })
})

// ── notify ─────────────────────────────────────────────
describe('sdk.notify', () => {
  test('broadcasts pluginNotify with title and body', () => {
    const sdk = createSDK('my-plugin', tmpDir, broadcastSpy)
    sdk.notify('Alert', 'CPU is high')
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: 'pluginNotify', pluginId: 'my-plugin', title: 'Alert', body: 'CPU is high'
    })
  })

  test('body defaults to empty string when omitted', () => {
    const sdk = createSDK('my-plugin', tmpDir, broadcastSpy)
    sdk.notify('Info')
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ body: '' }))
  })
})

// ── cron ───────────────────────────────────────────────
describe('sdk.cron', () => {
  test('calls fn periodically and stop() clears interval', async () => {
    vi.useFakeTimers()
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const fn = vi.fn()
    const stop = sdk.cron(100, fn)
    vi.advanceTimersByTime(350)
    expect(fn).toHaveBeenCalledTimes(3)
    stop()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})

// ── onReload ───────────────────────────────────────────
describe('sdk.onReload', () => {
  test('stores the reload function in _reloadFn', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const cleanupFn = vi.fn()
    sdk.onReload(cleanupFn)
    expect(sdk._reloadFn).toBe(cleanupFn)
  })
})
