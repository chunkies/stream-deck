import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import worker_threads from 'worker_threads'
import fs   from 'fs'
import path from 'path'
import os   from 'os'
import { createRequire } from 'module'

// ── Fake Worker ────────────────────────────────────────
// A lightweight EventEmitter that mimics the worker_threads.Worker API
// used by plugin recovery logic.

class FakeWorker extends EventEmitter {
  _terminated = false

  postMessage(_msg: unknown): void { /* no-op for tests */ }

  terminate(): Promise<void> {
    this._terminated = true
    return Promise.resolve()
  }
}

const _require = createRequire(__filename)

// Track all fake workers created across tests
let fakeWorkerInstances: FakeWorker[] = []

// We patch the Worker constructor on the live worker_threads module object.
// Compiled CJS code does: var worker_threads_1 = require("worker_threads")
// so patching the exported object works because CJS modules are singletons.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wtModule = worker_threads as any
let origWorker: typeof wtModule.Worker

function installWorkerMock(): void {
  fakeWorkerInstances = []
  origWorker = wtModule.Worker
  wtModule.Worker = function FakeWorkerCtor(_script: string, _opts: unknown) {
    const w = new FakeWorker()
    fakeWorkerInstances.push(w)
    return w
  }
}

function uninstallWorkerMock(): void {
  wtModule.Worker = origWorker
}

// ── Plugin dir helper ──────────────────────────────────

function makePluginDir(pluginsDir: string, id: string): void {
  const pluginDir = path.join(pluginsDir, id)
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', description: '', author: '', icon: ''
  }))
  // index.js must exist for loadPlugins to inspect the directory
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = () => {}')
}

// ── Load a fresh server module ─────────────────────────
// We reload the compiled index on every test to get isolated state.

function freshServer(): {
  loadPlugins:  (dir: string) => void
  getPlugins:   () => Array<{ id: string; _status?: string; _error?: string }>
} {
  const idxPath = _require.resolve('../../../dist/electron/server/index')
  delete _require.cache[idxPath]
  return _require('../../../dist/electron/server/index')
}

// ── Tests ──────────────────────────────────────────────

describe('plugin crash recovery', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.useFakeTimers()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'))
    installWorkerMock()
  })

  afterEach(() => {
    uninstallWorkerMock()
    vi.useRealTimers()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('_status is loading immediately after registration, running after ready', () => {
    makePluginDir(tmpDir, 'myplugin')
    const srv = freshServer()

    srv.loadPlugins(tmpDir)

    // Status is 'loading' before the worker sends 'ready'
    expect(srv.getPlugins()).toHaveLength(1)
    expect(srv.getPlugins()[0]._status).toBe('loading')

    // Simulate worker startup success
    const w = fakeWorkerInstances[0]
    expect(w).toBeDefined()
    w.emit('message', { type: 'ready', actions: [] })

    expect(srv.getPlugins()[0]._status).toBe('running')
  })

  test('_status becomes restarting after first crash', () => {
    makePluginDir(tmpDir, 'crashplugin')
    const srv = freshServer()

    srv.loadPlugins(tmpDir)
    const w = fakeWorkerInstances[0]
    w.emit('message', { type: 'ready', actions: [] })
    expect(srv.getPlugins()[0]._status).toBe('running')

    // Simulate worker crash (non-zero exit)
    w.emit('exit', 1)

    expect(srv.getPlugins()[0]._status).toBe('restarting')
  })

  test('_status becomes failed and _error is set after 3 crashes', () => {
    makePluginDir(tmpDir, 'badplugin')
    const srv = freshServer()

    srv.loadPlugins(tmpDir)

    // Worker 0: initial — send ready, then crash
    fakeWorkerInstances[0].emit('message', { type: 'ready', actions: [] })
    fakeWorkerInstances[0].emit('exit', 1)
    expect(srv.getPlugins()[0]._status).toBe('restarting')

    // Retry 1 fires after 2 s
    vi.advanceTimersByTime(2100)
    expect(fakeWorkerInstances[1]).toBeDefined()
    fakeWorkerInstances[1].emit('exit', 1)
    expect(srv.getPlugins()[0]._status).toBe('restarting')

    // Retry 2 fires after 4 s
    vi.advanceTimersByTime(4100)
    expect(fakeWorkerInstances[2]).toBeDefined()
    fakeWorkerInstances[2].emit('exit', 1)
    expect(srv.getPlugins()[0]._status).toBe('restarting')

    // Retry 3 fires after 8 s — this is the final attempt (MAX_RETRIES = 3)
    vi.advanceTimersByTime(8100)
    expect(fakeWorkerInstances[3]).toBeDefined()
    fakeWorkerInstances[3].emit('exit', 1)

    const meta = srv.getPlugins()[0]
    expect(meta._status).toBe('failed')
    expect(meta._error).toMatch(/crashed after 3 restart attempts/)
  })

  test('_status resets to running and retries reset after successful restart', () => {
    makePluginDir(tmpDir, 'resilient')
    const srv = freshServer()

    srv.loadPlugins(tmpDir)
    fakeWorkerInstances[0].emit('message', { type: 'ready', actions: [] })
    fakeWorkerInstances[0].emit('exit', 1)

    vi.advanceTimersByTime(2100)
    const w1 = fakeWorkerInstances[1]
    expect(w1).toBeDefined()
    // This restart succeeds
    w1.emit('message', { type: 'ready', actions: ['resilient.doThing'] })

    const meta = srv.getPlugins()[0]
    expect(meta._status).toBe('running')
    expect(meta._error).toBeUndefined()
  })

  test('plugin stays in pluginsMeta when failed (not removed)', () => {
    makePluginDir(tmpDir, 'stayplugin')
    const srv = freshServer()

    srv.loadPlugins(tmpDir)
    fakeWorkerInstances[0].emit('message', { type: 'ready', actions: [] })

    // Three crashes → max retries
    fakeWorkerInstances[0].emit('exit', 1)
    vi.advanceTimersByTime(2100)
    fakeWorkerInstances[1].emit('exit', 1)
    vi.advanceTimersByTime(4100)
    fakeWorkerInstances[2].emit('exit', 1)
    vi.advanceTimersByTime(8100)
    fakeWorkerInstances[3].emit('exit', 1)

    const plugins = srv.getPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('stayplugin')
    expect(plugins[0]._status).toBe('failed')
  })
})
