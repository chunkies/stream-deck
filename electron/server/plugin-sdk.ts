import { execSync, exec } from 'child_process'
import fs   from 'fs'
import path from 'path'
import { platform } from 'os'
import WebSocket from 'ws'

const SHELL = platform() === 'win32' ? 'cmd.exe' : '/bin/sh'

type BroadcastFn = (payload: Record<string, unknown>) => void

interface ShellOpts { timeout?: number }
interface HttpOpts  { timeout?: number; headers?: Record<string, string>; raw?: boolean }

export interface WidgetOpts {
  label?: string
  color?: string
  icon?:  string
  image?: string | null
  badge?: string
  text?:  string  // backwards compat alias for badge
}
export type TileOpts = WidgetOpts  // backwards compat alias

function validateUrl(url: string, pluginId: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error(`Invalid URL: ${url}`) }
  const host = parsed.hostname
  // Block loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw new Error(`Plugin "${pluginId}" blocked: requests to localhost are not allowed`)
  }
  // Block RFC1918 private ranges (simple prefix check)
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error(`Plugin "${pluginId}" blocked: requests to private IP ranges are not allowed`)
  }
  // Block link-local and metadata endpoints
  if (host === '169.254.169.254' || /^169\.254\./.test(host)) {
    throw new Error(`Plugin "${pluginId}" blocked: requests to link-local addresses are not allowed`)
  }
}

export interface PluginSDK {
  pluginId: string
  shell: {
    execSync:  (cmd: string, opts?: ShellOpts) => string
    exec:      (cmd: string, opts?: ShellOpts) => string  // deprecated alias for execSync
    execAsync: (cmd: string, opts?: ShellOpts) => Promise<string>
  }
  storage: {
    get:    (key: string) => unknown
    getAll: () => Record<string, unknown>
    set:    (key: string, value: unknown) => void
    delete: (key: string) => void
    clear:  () => void
  }
  http: {
    get(url: string, opts: HttpOpts & { raw: true }): Promise<Response>
    get(url: string, opts?: HttpOpts): Promise<unknown>
    post(url: string, body: unknown, opts: HttpOpts & { raw: true }): Promise<Response>
    post(url: string, body: unknown, opts?: HttpOpts): Promise<unknown>
    request: (url: string, init?: RequestInit) => Promise<Response>
  }
  tile: {
    set:   (pageId: string, tileId: string, opts: TileOpts) => void
    flash: (pageId: string, tileId: string, color: string, ms?: number) => void
  }
  widget: {
    set:   (actionKey: string, opts: WidgetOpts) => void
    flash: (actionKey: string, color: string, ms?: number) => void
  }
  broadcast: (event: string | Record<string, unknown>, data?: Record<string, unknown>) => void
  cron:      (intervalMs: number, fn: () => void | Promise<void>) => () => void
  notify:    (title: string, body?: string) => void
  onAction:  (key: string, fn: (params: unknown) => Promise<void> | void) => void
  on:        (key: string, fn: (params: unknown) => Promise<void> | void) => void
  onReload:  (fn: () => void) => void
  ws:        typeof WebSocket
  log:       { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

/** @internal Used by the plugin runner and tests — not part of the public plugin API */
export interface InternalPluginSDK extends PluginSDK {
  emit:      (key: string, params: unknown) => Promise<void>
  _handlers: Record<string, (params: unknown) => Promise<void> | void>
  _reloadFn: (() => void) | null
}

export function createSDK(pluginId: string, pluginsDataDir: string, broadcastFn: BroadcastFn): InternalPluginSDK {
  const storageFile = path.join(pluginsDataDir, `${pluginId}.json`)
  const _handlers: Record<string, (params: unknown) => Promise<void> | void> = {}

  function loadStorage(): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(storageFile, 'utf8')) as Record<string, unknown> } catch { return {} }
  }
  function saveStorage(data: Record<string, unknown>): void {
    fs.mkdirSync(pluginsDataDir, { recursive: true })
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2))
  }

  // In-memory write-through cache — loaded once on first access, kept in sync on mutations
  let storageCache: Record<string, unknown> | null = null
  function getCache(): Record<string, unknown> {
    if (!storageCache) storageCache = loadStorage()
    return storageCache
  }

  const _reloadFns: (() => void)[] = []

  // Per-plugin broadcast rate limiting
  let broadcastCount  = 0
  let broadcastWindow = Date.now()
  const MAX_BROADCASTS_PER_SEC = 30

  function rateLimitedBroadcast(payload: Record<string, unknown>): void {
    const now = Date.now()
    if (now - broadcastWindow >= 1000) { broadcastCount = 0; broadcastWindow = now }
    broadcastCount++
    if (broadcastCount > MAX_BROADCASTS_PER_SEC) {
      console.warn(`[plugin:${pluginId}] broadcast rate limit exceeded (>${MAX_BROADCASTS_PER_SEC}/s) — dropping`)
      return
    }
    broadcastFn(payload)
  }

  // Per-plugin notify rate limiting
  let notifyCount  = 0
  let notifyWindow = Date.now()

  return {
    pluginId,

    // Run shell commands.
    // execSync() / exec() is synchronous — blocks the server thread for the duration. Only use it for
    // fast commands (<50ms, e.g. reading /proc files). Use execAsync() for everything else.
    shell: {
      execSync:  (cmd, opts = {}) =>
        execSync(cmd, { shell: SHELL, timeout: opts.timeout ?? 5000 }).toString().trim(),
      exec:      (cmd, opts = {}) =>
        execSync(cmd, { shell: SHELL, timeout: opts.timeout ?? 5000 }).toString().trim(),
      execAsync: (cmd, opts = {}) =>
        new Promise((resolve, reject) =>
          exec(cmd, { shell: SHELL, timeout: opts.timeout ?? 5000 }, (err, stdout) =>
            err ? reject(err) : resolve(stdout.trim())
          )
        )
    },

    // Namespaced key-value storage — in-memory write-through cache backed by JSON on disk
    storage: {
      get:    (key)        => getCache()[key],
      getAll: ()           => ({ ...getCache() }),
      set:    (key, value) => { const d = getCache(); d[key] = value; saveStorage(d) },
      delete: (key)        => { const d = getCache(); delete d[key]; saveStorage(d) },
      clear:  ()           => { storageCache = {}; saveStorage({}) }
    },

    // HTTP helpers — all methods block RFC1918 / loopback / link-local targets (SSRF protection)
    http: {
      // Cast satisfies the overload interface: runtime returns Response when raw:true, unknown otherwise
      get: ((url: string, opts: HttpOpts = {}) => {
        try { validateUrl(url, pluginId) } catch (e) { return Promise.reject(e) }
        return fetch(url, { signal: AbortSignal.timeout(opts.timeout ?? 8000), headers: opts.headers })
          .then(r => opts.raw ? r : r.json())
      }) as PluginSDK['http']['get'],
      post: ((url: string, body: unknown, opts: HttpOpts = {}) => {
        try { validateUrl(url, pluginId) } catch (e) { return Promise.reject(e) }
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeout ?? 8000)
        }).then(r => opts.raw ? r : r.json())
      }) as PluginSDK['http']['post'],
      request: (url, init) => {
        try { validateUrl(url, pluginId) } catch (e) { return Promise.reject(e) }
        return fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) })
      }
    },

    // Push updates to a tile component display (legacy positional API — prefer widget.set)
    tile: {
      set: (pageId, tileId, opts) => {
        rateLimitedBroadcast({ type: 'tileUpdate', key: `${pageId}:${tileId}`, ...opts })
      },
      flash: (pageId, tileId, color, ms = 500) => {
        rateLimitedBroadcast({ type: 'tileFlash', key: `${pageId}:${tileId}`, color, ms })
      }
    },

    // Push updates to a widget component display by action key
    widget: {
      set: (actionKey, opts) => {
        if (!actionKey.startsWith(pluginId + '.')) {
          console.warn(`[plugin:${pluginId}] sdk.widget.set: key "${actionKey}" must start with "${pluginId}." — call ignored`)
          return
        }
        // Whitelist opts fields — do not spread untrusted data directly
        const safe: Record<string, unknown> = { type: 'widgetUpdate', key: actionKey }
        if (opts.label !== undefined) safe['label'] = String(opts.label)
        if (opts.color !== undefined) safe['color'] = String(opts.color)
        if (opts.icon  !== undefined) safe['icon']  = String(opts.icon)
        if (opts.image !== undefined) safe['image'] = opts.image === null ? null : String(opts.image)
        if (opts.badge !== undefined) safe['badge'] = String(opts.badge)
        if (opts.text  !== undefined) safe['badge'] = String(opts.text)  // text is alias for badge
        rateLimitedBroadcast(safe)
      },
      flash: (actionKey, color, ms = 500) => {
        if (!actionKey.startsWith(pluginId + '.')) {
          console.warn(`[plugin:${pluginId}] sdk.widget.flash: key "${actionKey}" must start with "${pluginId}." — call ignored`)
          return
        }
        rateLimitedBroadcast({ type: 'widgetFlash', key: actionKey, color, ms })
      }
    },

    // Broadcast a message to all connected PWA clients
    broadcast: (event, data) => {
      const payload = (typeof event === 'string' && data)
        ? { type: 'pluginEvent', pluginId, event, ...data }
        : { type: 'pluginEvent', pluginId, ...(event as Record<string, unknown>) }
      rateLimitedBroadcast(payload)
    },

    // Periodic timer — returns a stop function. Errors are logged, not swallowed.
    cron: (intervalMs, fn) => {
      const id = setInterval(() => {
        new Promise<void>(resolve => resolve(fn())).catch(err => console.error(`[plugin:${pluginId}] cron error:`, err))
      }, intervalMs)
      return () => clearInterval(id)
    },

    // Show a desktop notification via the renderer
    notify: (title, body) => {
      const now = Date.now()
      if (now - notifyWindow >= 1000) { notifyCount = 0; notifyWindow = now }
      notifyCount++
      if (notifyCount > 5) {
        console.warn(`[plugin:${pluginId}] notify rate limit exceeded (>5/s) — dropping`)
        return
      }
      broadcastFn({ type: 'pluginNotify', pluginId, title, body: body ?? '' })
    },

    // Register an action handler (key → async fn)
    onAction: (key, fn) => {
      if (!key.startsWith(pluginId + '.')) {
        console.warn(`[plugin:${pluginId}] sdk.onAction: key "${key}" should start with "${pluginId}." — handler registered but may never be called`)
      }
      _handlers[key] = fn
    },

    // on is kept as a deprecated alias for onAction
    on: (key, fn) => { _handlers[key] = fn },

    // Register a cleanup function called when the plugin is hot-reloaded — multiple calls supported
    onReload: (fn) => { _reloadFns.push(fn) },

    // Emit an action (called by the server when a button/slider fires)
    emit: async (key, params) => {
      if (_handlers[key]) await _handlers[key](params)
    },

    // Internal: used by the plugin loader to extract registered handlers
    _handlers,

    // Internal: returns a wrapper that calls all registered reload functions, or null if none
    get _reloadFn() {
      return _reloadFns.length > 0 ? () => { _reloadFns.forEach(fn => fn()) } : null
    },

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
