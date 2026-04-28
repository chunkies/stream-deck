'use strict'

const fs   = require('fs')
const path = require('path')
const os   = require('os')

// Mock child_process before requiring the SDK
jest.mock('child_process', () => ({
  execSync: jest.fn(() => 'output'),
  exec: jest.fn()
}))

const { execSync, exec } = require('child_process')
const { createSDK } = require('../server/plugin-sdk')

let tmpDir
let broadcastSpy

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-test-'))
  broadcastSpy = jest.fn()
  execSync.mockClear()
  exec.mockClear()
})

afterEach(() => {
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
    exec.mockImplementation((_cmd, _opts, cb) => cb(null, '  async output  '))
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    const result = await sdk.shell.execAsync('echo hi')
    expect(result).toBe('async output')
  })

  test('rejects on error', async () => {
    exec.mockImplementation((_cmd, _opts, cb) => cb(new Error('fail')))
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
    const handler = jest.fn()
    sdk.on('myPlugin.doThing', handler)
    await sdk.emit('myPlugin.doThing', { value: 10 })
    expect(handler).toHaveBeenCalledWith({ value: 10 })
  })

  test('unregistered key does nothing', async () => {
    const sdk = createSDK('test', tmpDir, broadcastSpy)
    await expect(sdk.emit('nonexistent', {})).resolves.toBeUndefined()
  })
})
