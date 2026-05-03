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
let broadcastCalls: Record<string, unknown>[]

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-test-'))
  broadcastCalls = []
  broadcastSpy = vi.fn((payload: Record<string, unknown>) => { broadcastCalls.push(payload) })

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

  test('getAll returns all data', () => {
    const sdk = createSDK('myplugin', tmpDir, broadcastSpy)
    sdk.storage.set('a', 1)
    sdk.storage.set('b', 2)
    expect(sdk.storage.getAll()).toEqual({ a: 1, b: 2 })
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
    expect(sdk.storage.getAll()).toEqual({})
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

  test('catches and logs errors thrown by the callback', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const stop = sdk.cron(100, () => { throw new Error('cron boom') })
    vi.advanceTimersByTime(150)
    await Promise.resolve()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[plugin:test] cron error:'),
      expect.any(Error)
    )
    stop()
    errorSpy.mockRestore()
    vi.useRealTimers()
  })
})

// ── onReload ───────────────────────────────────────────
describe('sdk.onReload', () => {
  test('_reloadFn calls all registered functions', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    sdk.onReload(fn1)
    sdk.onReload(fn2)
    expect(sdk._reloadFn).toBeTypeOf('function')
    sdk._reloadFn!()
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })

  test('_reloadFn is null when no function registered', () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    expect(sdk._reloadFn).toBeNull()
  })
})

// ── widget.set ─────────────────────────────────────────
describe('sdk.widget.set', () => {
  let sdk: ReturnType<typeof createSDK>
  beforeEach(() => { sdk = createSDK('demo', tmpDir, broadcastSpy) })

  test('broadcasts widgetUpdate with whitelisted fields only', () => {
    sdk.widget.set('demo.ping', { label: 'Hello', color: '#ff0000', badge: '3' })
    const call = broadcastCalls.find(c => c['type'] === 'widgetUpdate')
    expect(call).toBeTruthy()
    expect(call!['key']).toBe('demo.ping')
    expect(call!['label']).toBe('Hello')
    expect(call!['color']).toBe('#ff0000')
    expect(call!['badge']).toBe('3')
  })

  test('ignores call when key does not start with pluginId', () => {
    sdk.widget.set('other.ping', { label: 'X' })
    expect(broadcastCalls.find(c => c['type'] === 'widgetUpdate')).toBeUndefined()
  })

  test('counts toward broadcast rate limit', () => {
    for (let i = 0; i < 5; i++) sdk.widget.set('demo.ping', { label: String(i) })
    expect(broadcastCalls.filter(c => c['type'] === 'widgetUpdate').length).toBe(5)
  })

  test('text opt maps to badge', () => {
    sdk.widget.set('demo.ping', { text: 'hello' })
    const call = broadcastCalls.find(c => c['type'] === 'widgetUpdate')
    expect(call!['badge']).toBe('hello')
  })

  test('strips non-whitelisted fields from payload', () => {
    sdk.widget.set('demo.ping', { label: 'ok', color: '#fff' } as any)
    const call = broadcastCalls.find(c => c['type'] === 'widgetUpdate')
    expect(call).toBeTruthy()
    // Only whitelisted fields should be present
    const keys = Object.keys(call!)
    expect(keys).toContain('type')
    expect(keys).toContain('key')
    expect(keys).toContain('label')
    expect(keys).toContain('color')
    // Arbitrary extra fields must not leak through
    sdk.widget.set('demo.ping', { label: 'x', injected: 'evil', arbitrary: 42 } as any)
    const call2 = broadcastCalls.filter(c => c['type'] === 'widgetUpdate')[1]
    expect(call2!['injected']).toBeUndefined()
    expect(call2!['arbitrary']).toBeUndefined()
  })
})

// ── widget.flash ───────────────────────────────────────
describe('sdk.widget.flash', () => {
  let sdk: ReturnType<typeof createSDK>
  beforeEach(() => { sdk = createSDK('demo', tmpDir, broadcastSpy) })

  test('broadcasts widgetFlash with default 500ms', () => {
    sdk.widget.flash('demo.ping', '#00ff00')
    const call = broadcastCalls.find(c => c['type'] === 'widgetFlash')
    expect(call!['key']).toBe('demo.ping')
    expect(call!['color']).toBe('#00ff00')
    expect(call!['ms']).toBe(500)
  })

  test('ignores call when key does not start with pluginId', () => {
    sdk.widget.flash('other.event', '#ff0000')
    expect(broadcastCalls.find(c => c['type'] === 'widgetFlash')).toBeUndefined()
  })

  test('accepts custom duration', () => {
    sdk.widget.flash('demo.ping', '#ff0000', 1200)
    const call = broadcastCalls.find(c => c['type'] === 'widgetFlash')
    expect(call!['ms']).toBe(1200)
  })
})

// ── onAction key validation ────────────────────────────
describe('sdk.onAction key validation', () => {
  let sdk: ReturnType<typeof createSDK>
  beforeEach(() => { sdk = createSDK('demo', tmpDir, broadcastSpy) })

  test('warns when key does not start with pluginId', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sdk.onAction('wrong.key', () => {})
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('should start with'))
    warnSpy.mockRestore()
  })

  test('no warning when key starts with pluginId', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sdk.onAction('demo.myAction', () => {})
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ── storage.getAll ─────────────────────────────────────
describe('sdk.storage.getAll', () => {
  test('returns entire storage object', () => {
    const sdk = createSDK('demo', tmpDir, broadcastSpy)
    sdk.storage.set('a', 1)
    sdk.storage.set('b', 2)
    const all = sdk.storage.getAll()
    expect(all.a).toBe(1)
    expect(all.b).toBe(2)
  })
})

// ── http SSRF blocking ─────────────────────────────────
describe('sdk.http SSRF blocking', () => {
  let sdk: ReturnType<typeof createSDK>
  beforeEach(() => { sdk = createSDK('demo', tmpDir, broadcastSpy) })

  test('rejects localhost', async () => {
    await expect(sdk.http.get('http://localhost/api')).rejects.toThrow(/localhost/)
  })
  test('rejects 127.0.0.1', async () => {
    await expect(sdk.http.get('http://127.0.0.1/api')).rejects.toThrow()
  })
  test('rejects RFC1918 192.168.x.x', async () => {
    await expect(sdk.http.get('http://192.168.1.1/api')).rejects.toThrow()
  })
  test('rejects RFC1918 10.x.x.x', async () => {
    await expect(sdk.http.get('http://10.0.0.1/api')).rejects.toThrow()
  })
  test('rejects RFC1918 172.16.x.x', async () => {
    await expect(sdk.http.get('http://172.16.0.1/api')).rejects.toThrow()
  })
  test('rejects metadata endpoint 169.254.169.254', async () => {
    await expect(sdk.http.get('http://169.254.169.254/latest/meta-data/')).rejects.toThrow()
  })
  test('allows public URLs (no SSRF block)', async () => {
    // Don't actually fetch — just verify validateUrl doesn't throw with "blocked"
    await expect(sdk.http.get('https://example.com/api')).rejects.not.toThrow(/blocked/)
  })
})

// ── notify rate limit ──────────────────────────────────
describe('sdk.notify rate limit', () => {
  test('drops notifications beyond 5 per second', () => {
    const sdk = createSDK('demo', tmpDir, broadcastSpy)
    for (let i = 0; i < 10; i++) sdk.notify('Test', 'body')
    const notifyCalls = broadcastCalls.filter(c => c['type'] === 'pluginNotify')
    expect(notifyCalls.length).toBeLessThanOrEqual(5)
  })

  test('6th notification in same second is dropped', () => {
    const sdk = createSDK('demo', tmpDir, broadcastSpy)
    for (let i = 0; i < 6; i++) sdk.notify('Test', String(i))
    const notifyCalls = broadcastCalls.filter(c => c['type'] === 'pluginNotify')
    expect(notifyCalls.length).toBe(5)
    // The 6th body should not appear in any broadcast
    expect(notifyCalls.some(c => c['body'] === '5')).toBe(false)
  })
})
