// Type definitions for @macropad/plugin-sdk
// Plugins run inside a Node.js worker_threads Worker — the SDK object is
// injected by the host application at startup.

// ── WebSocket client (matches the `ws` npm package API) ──────────────────────

export interface WsClient {
  on(event: 'message', listener: (data: Buffer | string) => void): this
  on(event: 'open',    listener: () => void): this
  on(event: 'close',   listener: (code: number, reason: Buffer) => void): this
  on(event: 'error',   listener: (err: Error) => void): this
  on(event: string,    listener: (...args: unknown[]) => void): this
  send(data: string | Buffer | ArrayBuffer, callback?: (err?: Error) => void): void
  close(code?: number, reason?: string | Buffer): void
  terminate(): void
  readonly readyState: 0 | 1 | 2 | 3
  readonly CONNECTING: 0
  readonly OPEN: 1
  readonly CLOSING: 2
  readonly CLOSED: 3
}

export interface WsConstructor {
  new(address: string, options?: Record<string, unknown>): WsClient
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface ShellOpts {
  /** Milliseconds before the command is killed. Default: 5000. */
  timeout?: number
}

export interface HttpOpts {
  /** Milliseconds before the request is aborted. Default: 8000. */
  timeout?: number
  /** Extra request headers. */
  headers?: Record<string, string>
  /**
   * When true, returns the raw `Response` object instead of parsed JSON.
   * Useful for non-JSON endpoints or when you need status codes / headers.
   */
  raw?: boolean
}

export interface WidgetOpts {
  /** Text shown below the icon (button label or tile main value). */
  label?: string
  /** Background colour as a CSS colour string (e.g. `'#1e293b'`). */
  color?: string
  /** Emoji or text icon shown above the label. */
  icon?:  string
  /** URL or data-URI for an image to display inside the cell. Pass `null` to clear. */
  image?: string | null
  /** Small badge overlay on the cell (e.g. a count or status word). */
  badge?: string
  /** Alias for `badge` — kept for backwards compatibility. */
  text?:  string
}

/** Alias for WidgetOpts (legacy `sdk.tile.*` API). */
export type TileOpts = WidgetOpts

// ── Action params ─────────────────────────────────────────────────────────────

/**
 * Default type for action handler params.
 * Use a generic on `sdk.onAction` to narrow this to your own shape:
 *
 * ```ts
 * sdk.onAction<{ message: string }>('myplugin.send', ({ message }) => { ... })
 * ```
 */
export type ActionParams = Record<string, unknown> | null | undefined

// ── Broadcast registry ────────────────────────────────────────────────────────
//
// Plugins can opt-in to typed broadcast events via TypeScript declaration merging:
//
//   declare global {
//     interface MacroPadBroadcastRegistry {
//       'myplugin.status': { cpu: number; temp: string }
//       'myplugin.alert':  { level: 'warn' | 'error'; message: string }
//     }
//   }
//
// sdk.broadcast('myplugin.status', { cpu: 42, temp: '61°C' })  // now type-safe
// No runtime overhead — types are stripped by tsc.
//
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MacroPadBroadcastRegistry {}

// ── Main SDK interface ─────────────────────────────────────────────────────────

export interface MacroPadSDK {
  /** The plugin's own id — matches the `id` field in `manifest.json`. */
  readonly pluginId: string

  // ── Shell ────────────────────────────────────────────────────────────────────

  shell: {
    /**
     * Run a shell command synchronously. Blocks the worker thread.
     * Only use for fast commands (< 50 ms). For anything slower, use `execAsync`.
     */
    execSync(cmd: string, opts?: ShellOpts): string
    /**
     * @deprecated Alias for `execSync`. Use `execAsync` for long-running commands.
     */
    exec(cmd: string, opts?: ShellOpts): string
    /** Run a shell command asynchronously. Does not block. */
    execAsync(cmd: string, opts?: ShellOpts): Promise<string>
  }

  // ── Storage ──────────────────────────────────────────────────────────────────

  /**
   * Persistent key-value storage, scoped to this plugin.
   * Data is stored on disk and survives app restarts.
   */
  storage: {
    /** Retrieve a value by key. Returns `undefined` when not set. */
    get(key: string): unknown
    /** Retrieve all stored key-value pairs as a plain object. */
    getAll(): Record<string, unknown>
    /** Store a value. Persisted to disk immediately. */
    set(key: string, value: unknown): void
    /** Delete a single key. */
    delete(key: string): void
    /** Delete all keys for this plugin. */
    clear(): void
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────────

  /**
   * HTTP helpers. All URLs are validated against an SSRF blocklist:
   * localhost, 127.x.x.x, RFC1918 ranges, and link-local addresses are blocked.
   */
  http: {
    /** GET a URL and return the raw `Response`. */
    get(url: string, opts: HttpOpts & { raw: true }): Promise<Response>
    /** GET a URL and return the parsed JSON body. */
    get(url: string, opts?: HttpOpts): Promise<unknown>
    /** POST JSON to a URL and return the raw `Response`. */
    post(url: string, body: unknown, opts: HttpOpts & { raw: true }): Promise<Response>
    /** POST JSON to a URL and return the parsed JSON body. */
    post(url: string, body: unknown, opts?: HttpOpts): Promise<unknown>
    /** Full `fetch`-style request. Returns the raw `Response`. */
    request(url: string, init?: RequestInit): Promise<Response>
  }

  // ── Widget / Tile display ─────────────────────────────────────────────────────

  /**
   * Push a live display update to a widget component, identified by its action key.
   * The key must start with your plugin id (e.g. `'myplugin.status'`).
   */
  widget: {
    /** Update the label, colour, icon, image, or badge on the component. */
    set(actionKey: string, opts: WidgetOpts): void
    /** Briefly flash the component background to `color` for `ms` milliseconds. */
    flash(actionKey: string, color: string, ms?: number): void
  }

  /**
   * Push a live display update to a tile component, identified by page and tile id.
   * @deprecated Prefer `sdk.widget.set` with an action key instead.
   */
  tile: {
    /** Update the tile display. */
    set(pageId: string, tileId: string, opts: TileOpts): void
    /** Briefly flash the tile background. */
    flash(pageId: string, tileId: string, color: string, ms?: number): void
  }

  // ── Broadcast ────────────────────────────────────────────────────────────────

  /**
   * Broadcast an event to all connected PWA clients.
   * Tiles subscribed to this plugin via `pluginTileId` / `pluginTileEvent` will
   * update their displayed value automatically.
   *
   * Rate limited to 30 events/second.
   *
   * @example
   * sdk.broadcast('status', { cpu: '42%', temp: '61°C' })
   */
  broadcast<E extends keyof MacroPadBroadcastRegistry>(event: E, data: MacroPadBroadcastRegistry[E]): void
  broadcast(event: string, data?: Record<string, unknown>): void

  // ── Cron ─────────────────────────────────────────────────────────────────────

  /**
   * Schedule a periodic callback. Returns a function that cancels the timer.
   *
   * @param intervalMs Interval in milliseconds.
   * @param fn         Callback. May be async.
   * @returns          A stop function — call it to cancel the timer.
   *
   * @example
   * const stop = sdk.cron(5000, async () => {
   *   sdk.broadcast('tick', { time: Date.now() })
   * })
   */
  cron(intervalMs: number, fn: () => void | Promise<void>): () => void

  // ── Notifications ─────────────────────────────────────────────────────────────

  /**
   * Show a native desktop notification (via the Electron main process).
   * Rate limited to 5 notifications/second.
   */
  notify(title: string, body?: string): void

  // ── Action handlers ───────────────────────────────────────────────────────────

  /**
   * Register a handler for a plugin action.
   * Called when a button, switch, slider, knob, voice command, or trackpad
   * gesture fires the action on the connected phone.
   *
   * The `key` must start with your plugin id (e.g. `'myplugin.doThing'`).
   * Use a generic to type `params`:
   *
   * @example
   * sdk.onAction<{ value: number }>('myplugin.setVolume', ({ value }) => {
   *   sdk.shell.execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${value}%`)
   * })
   */
  onAction<P = ActionParams>(key: string, fn: (params: P) => Promise<void> | void): void

  /**
   * @deprecated Alias for `onAction`. Use `onAction` in new plugins.
   */
  on<P = ActionParams>(key: string, fn: (params: P) => Promise<void> | void): void

  // ── Reload ────────────────────────────────────────────────────────────────────

  /**
   * Register a cleanup function to run when the plugin is hot-reloaded.
   * Use it to close connections or clear timers started at plugin load.
   * May be called multiple times — all registered functions will run.
   */
  onReload(fn: () => void): void

  // ── WebSocket ─────────────────────────────────────────────────────────────────

  /**
   * The `ws` WebSocket constructor, pre-imported by the host so your plugin
   * doesn't need to bundle `ws` itself.
   *
   * @example
   * const conn = new sdk.ws('wss://example.com/socket')
   * conn.on('message', (data) => sdk.broadcast('wsData', { data: String(data) }))
   */
  ws: WsConstructor

  // ── Logging ───────────────────────────────────────────────────────────────────

  /**
   * Prefixed logging — output appears in the main process console as
   * `[plugin:your-id] ...`.
   */
  log: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
}

// ── Manifest types ────────────────────────────────────────────────────────────

export interface PluginParam {
  key:          string
  label:        string
  type?:        'text' | 'number' | 'textarea'
  default?:     string | number
  placeholder?: string
}

export interface PluginAction {
  key:            string
  label:          string
  componentType?: 'button' | 'switch' | 'slider' | 'knob' | 'voice' | 'trackpad'
  params?:        PluginParam[]
}

export interface PluginWidget {
  /** Action key that broadcasts the data for this widget (e.g. `'myplugin.status'`). */
  key:             string
  /** Human-readable label shown in the widget catalogue. */
  label:           string
  description?:    string
  icon?:           string
  /** Which field of the broadcast payload to display. Defaults to `'value'`. */
  field?:          string
  defaultColSpan?: number
  defaultRowSpan?: number
}

export interface PluginManifest {
  id:               string
  name:             string
  version:          string
  description:      string
  author:           string
  icon?:            string
  license?:         string
  minAppVersion?:   string
  actions:          PluginAction[]
  widgets?:         PluginWidget[]
}

// ── definePlugin ─────────────────────────────────────────────────────────────

export type PluginFactory = (sdk: MacroPadSDK) => void

/**
 * Wrap your plugin factory for full TypeScript inference.
 * No runtime overhead — `definePlugin(fn)` returns `fn` unchanged.
 *
 * @example
 * import { definePlugin } from '@macropad/plugin-sdk'
 *
 * export default definePlugin((sdk) => {
 *   sdk.onAction('myplugin.ping', () => sdk.notify('Pong!'))
 * })
 */
export declare function definePlugin(factory: PluginFactory): PluginFactory
