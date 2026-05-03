import type { MacroPadSDK, WidgetOpts } from './index'

// ── Captured call shapes ──────────────────────────────────────────────────────

export interface MockBroadcast {
  event: string
  data: Record<string, unknown>
}

export interface MockNotification {
  title: string
  body?: string
}

export interface MockWidgetSet {
  type: 'widget' | 'tile'
  key?: string
  pageId?: string
  tileId?: string
  opts: WidgetOpts
}

export interface MockWidgetFlash {
  type: 'widget' | 'tile'
  key?: string
  pageId?: string
  tileId?: string
  color: string
  ms: number
}

export interface MockLogEntry {
  level: 'info' | 'warn' | 'error'
  args: unknown[]
}

export interface MockCronEntry {
  ms: number
  fn: () => void | Promise<void>
}

// ── MockSDK ───────────────────────────────────────────────────────────────────

/**
 * Full mock SDK returned by createMockSDK().
 * Implements MacroPadSDK plus test-only helpers for asserting plugin behaviour.
 *
 * All SDK methods are real implementations that capture their arguments.
 * Replace any method with your own function to control return values:
 *
 *   sdk.shell.execAsync = vi.fn().mockResolvedValue('output')
 *   sdk.http.get = async () => ({ status: 'ok' })
 */
export interface MockSDK extends MacroPadSDK {
  // ── Captured calls ─────────────────────────────────────────────────────────

  /** Every broadcast made via sdk.broadcast() */
  readonly broadcasts: MockBroadcast[]
  /** Every sdk.notify() call */
  readonly notifications: MockNotification[]
  /** Every sdk.widget.set() and sdk.tile.set() call */
  readonly widgetSets: MockWidgetSet[]
  /** Every sdk.widget.flash() and sdk.tile.flash() call */
  readonly widgetFlashes: MockWidgetFlash[]
  /** Every sdk.log.* call */
  readonly logs: MockLogEntry[]

  // ── State ──────────────────────────────────────────────────────────────────

  /** Live snapshot of the storage state. Mutates as the plugin calls storage.set/delete/clear. */
  readonly store: Record<string, unknown>
  /** All sdk.cron() registrations. */
  readonly cronCallbacks: MockCronEntry[]
  /** All handlers registered via sdk.onAction() / sdk.on(). */
  readonly handlers: Record<string, (params: unknown) => void | Promise<void>>

  // ── Test helpers ───────────────────────────────────────────────────────────

  /**
   * Run all registered cron callbacks once, in order.
   * Use this to simulate a timer tick in tests.
   *
   * @example
   * await sdk.tickCron()
   * expect(sdk.broadcasts).toHaveLength(1)
   */
  tickCron(): Promise<void>

  /**
   * Dispatch an action handler by key.
   * Equivalent to the user pressing the button/slider/etc. on their phone.
   * Throws if no handler is registered for that key.
   *
   * @example
   * await sdk.dispatch('my-plugin.setVolume', { value: 75 })
   * expect(sdk.store.volume).toBe(75)
   */
  dispatch(key: string, params?: unknown): Promise<void>

  /**
   * Fire all registered onReload callbacks.
   * Use this to test cleanup / teardown logic.
   */
  reload(): void
}

// ── createMockSDK ─────────────────────────────────────────────────────────────

/**
 * Create a mock SDK instance for unit testing a MacroPad plugin.
 *
 * @param initialStorage  Pre-populate the storage state (optional).
 *
 * @example
 * import { createMockSDK } from '@macropad/plugin-sdk/testing'
 * import myPlugin from '../src/index'
 *
 * let sdk: MockSDK
 * beforeEach(() => { sdk = createMockSDK(); myPlugin(sdk) })
 *
 * test('hello fires a notification', async () => {
 *   await sdk.dispatch('my-plugin.hello', { message: 'hi' })
 *   expect(sdk.notifications[0].title).toBe('Hello!')
 * })
 */
export declare function createMockSDK(initialStorage?: Record<string, unknown>): MockSDK
