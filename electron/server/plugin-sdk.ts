import { execSync, exec } from 'child_process'
import fs   from 'fs'
import path from 'path'
import { platform } from 'os'
import WebSocket from 'ws'

const SHELL = platform() === 'win32' ? 'cmd.exe' : '/bin/sh'

type BroadcastFn = (payload: Record<string, unknown>) => void

interface ShellOpts { timeout?: number }
interface HttpOpts  { timeout?: number; headers?: Record<string, string>; raw?: boolean }

export interface TileOpts { text?: string; color?: string; icon?: string }

export interface PluginSDK {
  shell:     { exec: (cmd: string, opts?: ShellOpts) => string; execAsync: (cmd: string, opts?: ShellOpts) => Promise<string> }
  storage:   { get: (key?: string) => unknown; set: (key: string, value: unknown) => void; delete: (key: string) => void; clear: () => void }
  http:      { get: (url: string, opts?: HttpOpts) => Promise<unknown>; post: (url: string, body: unknown, opts?: HttpOpts) => Promise<unknown>; request: (url: string, init?: RequestInit) => Promise<Response> }
  tile:      { set: (pageId: string, tileId: string, opts: TileOpts) => void; flash: (pageId: string, tileId: string, color: string, ms?: number) => void }
  broadcast: (event: string | Record<string, unknown>, data?: Record<string, unknown>) => void
  cron:      (intervalMs: number, fn: () => void | Promise<void>) => () => void
  notify:    (title: string, body?: string) => void
  on:        (key: string, fn: (params: unknown) => Promise<void> | void) => void
  onReload:  (fn: () => void) => void
  emit:      (key: string, params: unknown) => Promise<void>
  _handlers: Record<string, (params: unknown) => Promise<void> | void>
  _reloadFn: (() => void) | null
  ws:        typeof WebSocket
  log:       { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

export function createSDK(pluginId: string, pluginsDataDir: string, broadcastFn: BroadcastFn): PluginSDK {
  const storageFile = path.join(pluginsDataDir, `${pluginId}.json`)
  const _handlers: Record<string, (params: unknown) => Promise<void> | void> = {}

  function loadStorage(): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(storageFile, 'utf8')) as Record<string, unknown> } catch { return {} }
  }
  function saveStorage(data: Record<string, unknown>): void {
    fs.mkdirSync(pluginsDataDir, { recursive: true })
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2))
  }

  let _reloadFn: (() => void) | null = null

  return {
    // Run shell commands.
    // exec() is synchronous — blocks the server thread for the duration. Only use it for
    // fast commands (<50ms, e.g. reading /proc files). Use execAsync() for everything else.
    shell: {
      exec: (cmd, opts = {}) =>
        execSync(cmd, { shell: SHELL, timeout: opts.timeout ?? 5000 }).toString().trim(),
      execAsync: (cmd, opts = {}) =>
        new Promise((resolve, reject) =>
          exec(cmd, { shell: SHELL, timeout: opts.timeout ?? 5000 }, (err, stdout) =>
            err ? reject(err) : resolve(stdout.trim())
          )
        )
    },

    // Namespaced key-value storage (persisted to JSON per plugin)
    storage: {
      get:    (key)        => { const d = loadStorage(); return key !== undefined ? d[key] : d },
      set:    (key, value) => { const d = loadStorage(); d[key] = value; saveStorage(d) },
      delete: (key)        => { const d = loadStorage(); delete d[key]; saveStorage(d) },
      clear:  ()           => saveStorage({})
    },

    // HTTP helpers
    http: {
      get:  (url, opts = {}) =>
        fetch(url, { signal: AbortSignal.timeout(opts.timeout ?? 8000), headers: opts.headers })
          .then(r => opts.raw ? r : r.json()),
      post: (url, body, opts = {}) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeout ?? 8000)
        }).then(r => opts.raw ? r : r.json()),
      request: (url, init) => fetch(url, init)
    },

    // Push updates to a tile component display
    tile: {
      set: (pageId, tileId, opts) => {
        broadcastFn({ type: 'tileUpdate', key: `${pageId}:${tileId}`, ...opts })
      },
      flash: (pageId, tileId, color, ms = 500) => {
        broadcastFn({ type: 'tileFlash', key: `${pageId}:${tileId}`, color, ms })
      }
    },

    // Broadcast a message to all connected PWA clients
    broadcast: (event, data) => {
      const payload = (typeof event === 'string' && data)
        ? { type: 'pluginEvent', pluginId, event, ...data }
        : { type: 'pluginEvent', pluginId, ...(event as Record<string, unknown>) }
      broadcastFn(payload)
    },

    // Periodic timer — returns a stop function
    cron: (intervalMs, fn) => {
      const id = setInterval(() => { Promise.resolve(fn()).catch(() => {}) }, intervalMs)
      return () => clearInterval(id)
    },

    // Show a desktop notification via the renderer
    notify: (title, body) => {
      broadcastFn({ type: 'pluginNotify', pluginId, title, body: body ?? '' })
    },

    // Register an action handler (key → async fn)
    on: (key, fn) => { _handlers[key] = fn },

    // Register a cleanup function called when the plugin is hot-reloaded
    onReload: (fn) => { _reloadFn = fn },

    // Emit an action (called by the server when a button/slider fires)
    emit: async (key, params) => {
      if (_handlers[key]) await _handlers[key](params)
    },

    // Internal: used by the plugin loader to extract registered handlers
    _handlers,

    // Internal: read live value via getter so onReload updates are visible
    get _reloadFn() { return _reloadFn },

    // WebSocket constructor (ws package) — lets plugins open outbound WS connections
    // without bundling ws themselves
    ws: WebSocket,

    // Logging (prefixed so dev knows which plugin logged)
    log: {
      info:  (...args) => console.log(`[plugin:${pluginId}]`,  ...args),
      warn:  (...args) => console.warn(`[plugin:${pluginId}]`, ...args),
      error: (...args) => console.error(`[plugin:${pluginId}]`, ...args)
    }
  }
}
