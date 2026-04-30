import { test as base, Page } from '@playwright/test'

// Config that the mock WebSocket delivers on connect
export const mockConfig = {
  grid: { cols: 3, rows: 3 },
  pages: [
    {
      id: 'p1',
      name: 'Home',
      components: [
        { id: 'c1', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Play', color: '#1e293b' },
        { id: 'c2', componentType: 'switch', col: 2, row: 1, colSpan: 1, rowSpan: 1, label: 'WiFi', color: '#1e293b' },
        { id: 'c3', componentType: 'button', col: 3, row: 1, colSpan: 1, rowSpan: 1, label: 'Mute', color: '#dc2626' },
      ],
    },
    {
      id: 'p2',
      name: 'Media',
      components: [
        { id: 'c4', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Prev', color: '#1e293b' },
      ],
    },
  ],
}

// Inject a mock WebSocket into the page that immediately delivers a config message
async function injectWsMock(page: Page, config = mockConfig) {
  await page.addInitScript((cfg) => {
    const listeners: Record<string, Function[]> = {}
    const mockWsInstance: any = {
      readyState: 1,
      send: (data: string) => {
        mockWsInstance._sent = mockWsInstance._sent || []
        mockWsInstance._sent.push(JSON.parse(data))
      },
      close: () => {},
      addEventListener: (ev: string, fn: Function) => {
        listeners[ev] = listeners[ev] || []
        listeners[ev].push(fn)
      },
      // Helper for tests: trigger a message through the registered handler
      triggerMessage: (data: object) => {
        listeners['message']?.forEach(fn => fn({ data: JSON.stringify(data) }))
      },
      get onopen()    { return listeners['open']?.[0]    },
      set onopen(fn)    { listeners['open']    = [fn] },
      get onclose()   { return listeners['close']?.[0]   },
      set onclose(fn)   { listeners['close']   = [fn] },
      get onerror()   { return listeners['error']?.[0]   },
      set onerror(fn)   { listeners['error']   = [fn] },
      get onmessage() { return listeners['message']?.[0] },
      set onmessage(fn) { listeners['message'] = [fn] },
    }
    ;(window as any).__mockWs = mockWsInstance

    ;(window as any).WebSocket = function() { return mockWsInstance }
    ;(window as any).WebSocket.OPEN       = 1
    ;(window as any).WebSocket.CONNECTING = 0
    ;(window as any).WebSocket.CLOSING    = 2
    ;(window as any).WebSocket.CLOSED     = 3

    // Deliver config + open event after the module finishes wiring handlers
    setTimeout(() => {
      listeners['open']?.forEach(fn => fn({}))
      listeners['message']?.forEach(fn => fn({ data: JSON.stringify({ type: 'config', config: cfg }) }))
    }, 50)
  }, config)
}

type Fixtures = {
  pwaPage: Page
}

export const test = base.extend<Fixtures>({
  pwaPage: async ({ page }, use) => {
    await injectWsMock(page)
    await page.goto('http://localhost:5174')
    // Wait for the grid to be populated
    await page.waitForSelector('.grid .btn-cell, .grid .switch-cell, .grid .folder-cell', { timeout: 5000 })
    await use(page)
  },
})

export { expect } from '@playwright/test'
