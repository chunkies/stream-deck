'use strict'

/**
 * createMockSDK — test harness for MacroPad plugins.
 *
 * Usage (vitest / jest):
 *
 *   import { createMockSDK } from '@macropad/plugin-sdk/testing'
 *   import myPlugin from '../src/index'
 *
 *   let sdk
 *   beforeEach(() => { sdk = createMockSDK(); myPlugin(sdk) })
 *
 *   test('hello fires a notification', async () => {
 *     await sdk.dispatch('my-plugin.hello', { message: 'hi' })
 *     expect(sdk.notifications[0].title).toBe('Hello!')
 *   })
 */
function createMockSDK(initialStorage = {}) {
  let store       = { ...initialStorage }
  const broadcasts    = []
  const notifications = []
  const widgetSets    = []
  const widgetFlashes = []
  const logs          = []
  const cronEntries   = []
  const reloadFns     = []
  const handlers      = {}

  const sdk = {
    pluginId: 'test-plugin',

    shell: {
      execSync:  () => '',
      exec:      () => '',
      execAsync: async () => '',
    },

    storage: {
      get:    (key)         => store[key],
      getAll: ()            => ({ ...store }),
      set:    (key, value)  => { store[key] = value },
      delete: (key)         => { delete store[key] },
      clear:  ()            => { store = {} },
    },

    http: {
      get:     async () => ({}),
      post:    async () => ({}),
      request: async () => new (typeof Response !== 'undefined' ? Response : Object)(),
    },

    tile: {
      set:   (pageId, tileId, opts)        => widgetSets.push({ type: 'tile', pageId, tileId, opts }),
      flash: (pageId, tileId, color, ms = 500) => widgetFlashes.push({ type: 'tile', pageId, tileId, color, ms }),
    },

    widget: {
      set:   (key, opts)          => widgetSets.push({ type: 'widget', key, opts }),
      flash: (key, color, ms = 500) => widgetFlashes.push({ type: 'widget', key, color, ms }),
    },

    broadcast: (event, data = {}) => {
      broadcasts.push({ event, data })
    },

    cron: (ms, fn) => {
      const entry = { ms, fn }
      cronEntries.push(entry)
      return () => {
        const i = cronEntries.indexOf(entry)
        if (i !== -1) cronEntries.splice(i, 1)
      }
    },

    notify: (title, body) => {
      notifications.push({ title, body })
    },

    onAction: (key, fn) => { handlers[key] = fn },
    on:       (key, fn) => { handlers[key] = fn },
    onReload: (fn)      => { reloadFns.push(fn) },

    ws: typeof WebSocket !== 'undefined' ? WebSocket : class MockWS { on() {} send() {} close() {} },

    log: {
      info:  (...args) => logs.push({ level: 'info',  args }),
      warn:  (...args) => logs.push({ level: 'warn',  args }),
      error: (...args) => logs.push({ level: 'error', args }),
    },

    // ── Test helpers ─────────────────────────────────────────────────────────

    /** Every broadcast made via sdk.broadcast() */
    get broadcasts()    { return broadcasts    },
    /** Every sdk.notify() call */
    get notifications() { return notifications },
    /** Every sdk.widget.set() and sdk.tile.set() call */
    get widgetSets()    { return widgetSets    },
    /** Every sdk.widget.flash() and sdk.tile.flash() call */
    get widgetFlashes() { return widgetFlashes },
    /** Every sdk.log.* call */
    get logs()          { return logs          },
    /** Live snapshot of storage state */
    get store()         { return store         },
    /** All sdk.cron() registrations */
    get cronCallbacks() { return cronEntries   },
    /** All registered action handlers */
    get handlers()      { return handlers      },

    /** Run all registered cron callbacks once, in order. */
    async tickCron() {
      for (const { fn } of cronEntries) await fn()
    },

    /**
     * Dispatch an action handler by key.
     * Throws if no handler is registered for that key.
     */
    async dispatch(key, params) {
      if (!handlers[key]) throw new Error(`No handler registered for "${key}"`)
      await handlers[key](params)
    },

    /** Fire all onReload callbacks. */
    reload() {
      for (const fn of reloadFns) fn()
    },
  }

  return sdk
}

exports.createMockSDK = createMockSDK
