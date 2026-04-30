import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mockWs } from './setup'
import { state } from '../src/state.js'

const baseConfig = {
  grid: { cols: 3, rows: 3 },
  pages: [
    { id: 'p1', name: 'Page 1', components: [] },
    { id: 'p2', name: 'Page 2', components: [] },
  ],
}

function sendMsg(msg: object) {
  mockWs.onmessage?.({ data: JSON.stringify(msg) })
}

beforeEach(async () => {
  // Ensure ws is connected and handler is set
  const { connect } = await import('../src/ws.js')
  connect()
  // Seed config so navigate/toggleState tests have context
  state.config       = structuredClone(baseConfig)
  state.currentPages = state.config!.pages
  state.currentPageIdx = 0
  state.navStack     = []
  state.toggleStates = {}
  document.getElementById('grid')!.innerHTML = ''
  document.getElementById('page-dots')!.innerHTML = ''
})

// ── toggleState ────────────────────────────────────────────────────────────

describe('toggleState message', () => {
  test('updates state.toggleStates', () => {
    sendMsg({ type: 'toggleState', key: 'p1:c1', active: true })
    expect(state.toggleStates['p1:c1']).toBe(true)
  })

  test('sets key to false when active is false', () => {
    state.toggleStates['p1:c1'] = true
    sendMsg({ type: 'toggleState', key: 'p1:c1', active: false })
    expect(state.toggleStates['p1:c1']).toBe(false)
  })

  test('does not throw when element is not in DOM', () => {
    expect(() => sendMsg({ type: 'toggleState', key: 'nonexistent:key', active: true })).not.toThrow()
  })
})

// ── navigate message ───────────────────────────────────────────────────────

describe('navigate message', () => {
  test('sets currentPageIdx to matching page', () => {
    sendMsg({ type: 'navigate', pageId: 'p2' })
    expect(state.currentPageIdx).toBe(1)
  })

  test('resets navStack to root on navigate', () => {
    state.navStack = [{ pages: [], pageIdx: 0 }]
    sendMsg({ type: 'navigate', pageId: 'p1' })
    expect(state.navStack).toHaveLength(0)
  })

  test('ignores unknown pageId', () => {
    state.currentPageIdx = 1
    sendMsg({ type: 'navigate', pageId: 'nonexistent' })
    expect(state.currentPageIdx).toBe(1)  // unchanged
  })
})

// ── config message re-initialises all state ────────────────────────────────

describe('config message', () => {
  test('clears toggleStates on new config', () => {
    state.toggleStates = { 'p1:c1': true, 'p2:c2': false }
    const newConfig = { grid: { cols: 2, rows: 2 }, pages: [{ id: 'nx', name: 'New', components: [] }] }
    sendMsg({ type: 'config', config: newConfig })
    expect(state.toggleStates).toEqual({})
  })

  test('resets navStack on new config', () => {
    state.navStack = [{ pages: [], pageIdx: 0 }]
    sendMsg({ type: 'config', config: baseConfig })
    expect(state.navStack).toHaveLength(0)
  })

  test('resets currentPageIdx to 0 on new config', () => {
    state.currentPageIdx = 2
    sendMsg({ type: 'config', config: baseConfig })
    expect(state.currentPageIdx).toBe(0)
  })

  test('sets currentPages to new config pages', () => {
    const newConfig = { grid: { cols: 2, rows: 2 }, pages: [{ id: 'fresh', name: 'Fresh', components: [] }] }
    sendMsg({ type: 'config', config: newConfig })
    expect(state.currentPages).toBe(state.config!.pages)
    expect(state.config!.pages[0].id).toBe('fresh')
  })
})

// ── customCSS injection ────────────────────────────────────────────────────

describe('config message — customCSS injection', () => {
  test('creates a <style id="custom-css"> element when customCSS is present', () => {
    document.getElementById('custom-css')?.remove()
    sendMsg({ type: 'config', config: { ...baseConfig, customCSS: '.btn { color: red }' } })
    const el = document.getElementById('custom-css')
    expect(el).not.toBeNull()
    expect(el?.tagName.toLowerCase()).toBe('style')
  })

  test('sets textContent of style element to customCSS value', () => {
    document.getElementById('custom-css')?.remove()
    sendMsg({ type: 'config', config: { ...baseConfig, customCSS: '.btn { color: red }' } })
    expect(document.getElementById('custom-css')?.textContent).toBe('.btn { color: red }')
  })

  test('updates existing style element instead of creating a duplicate', () => {
    document.getElementById('custom-css')?.remove()
    sendMsg({ type: 'config', config: { ...baseConfig, customCSS: '.btn { color: red }' } })
    sendMsg({ type: 'config', config: { ...baseConfig, customCSS: '.btn { color: blue }' } })
    expect(document.querySelectorAll('#custom-css')).toHaveLength(1)
    expect(document.getElementById('custom-css')?.textContent).toBe('.btn { color: blue }')
  })

  test('clears style element when customCSS is absent', () => {
    document.getElementById('custom-css')?.remove()
    sendMsg({ type: 'config', config: { ...baseConfig, customCSS: '.btn { color: red }' } })
    sendMsg({ type: 'config', config: baseConfig })
    expect(document.getElementById('custom-css')?.textContent).toBe('')
  })
})

// ── WebSocket connection status updates DOM ────────────────────────────────

describe('ws connection status', () => {
  test('onopen sets status to Connected', async () => {
    mockWs.onopen?.()
    expect(document.getElementById('ws-status')!.textContent).toBe('Connected')
  })

  test('onopen removes offline overlay', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.classList.add('visible')
    mockWs.onopen?.()
    expect(overlay.classList.contains('visible')).toBe(false)
  })

  test('onclose sets status to Disconnected', async () => {
    mockWs.onclose?.()
    expect(document.getElementById('ws-status')!.textContent).toBe('Disconnected')
  })

  test('onclose adds visible to offline overlay', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.classList.remove('visible')
    mockWs.onclose?.()
    expect(overlay.classList.contains('visible')).toBe(true)
  })

  test('onclose shows idle state (Connect button)', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.dataset.state = 'connecting'
    mockWs.onclose?.()
    expect(overlay.dataset.state).toBe('idle')
  })

  test('stale onclose from previous socket does not affect current connection', async () => {
    // Capture onclose from ws1, then call connect() to create ws2.
    // ws1.onclose firing after ws2 is created must NOT call showIdle
    // (generation guard should discard it).
    const { MockWebSocket } = await import('./setup')
    const { connect } = await import('../src/ws.js')

    const staleOnclose = mockWs.onclose  // handler from ws1
    connect()                             // creates ws2, increments generation
    const callsAfterWs2 = MockWebSocket.mock.calls.length

    // Put overlay in a non-idle state to detect if stale handler touches it
    document.getElementById('offline-overlay')!.classList.remove('visible')

    staleOnclose?.()                      // stale ws1 handler fires — must be ignored
    expect(MockWebSocket.mock.calls.length).toBe(callsAfterWs2) // no extra socket
    expect(document.getElementById('offline-overlay')!.classList.contains('visible')).toBe(false)
  })
})

// ── Visibility reconnect ───────────────────────────────────────────────────

describe('visibilitychange reconnect', () => {
  function setVisibility(v: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  test('shows idle state when page becomes visible and ws is not open', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.dataset.state = 'connecting'
    mockWs.readyState = WebSocket.CLOSED
    setVisibility('visible')
    expect(overlay.dataset.state).toBe('idle')
  })

  test('does not change overlay when page becomes visible and ws is already open', async () => {
    const { MockWebSocket } = await import('./setup')
    mockWs.readyState = WebSocket.OPEN
    const callsBefore = MockWebSocket.mock.calls.length
    setVisibility('visible')
    expect(MockWebSocket.mock.calls.length).toBe(callsBefore) // no new socket
  })

  test('calls ws.close() when page becomes hidden', async () => {
    // Explicit close before iOS suspends prevents zombie socket on resume
    mockWs.readyState = WebSocket.OPEN
    setVisibility('hidden')
    expect(mockWs.close).toHaveBeenCalled()
  })

  test('does not create new WebSocket when page becomes hidden', async () => {
    vi.useFakeTimers()
    const { MockWebSocket } = await import('./setup')
    mockWs.readyState = WebSocket.OPEN
    const callsBefore = MockWebSocket.mock.calls.length
    setVisibility('hidden')
    vi.advanceTimersByTime(2000)
    expect(MockWebSocket.mock.calls.length).toBe(callsBefore)
    vi.useRealTimers()
  })
})

// ── Zombie socket guard ────────────────────────────────────────────────────

describe('zombie socket guard', () => {
  test('shows idle state after ZOMBIE_TIMEOUT if still in CONNECTING — does not auto-retry', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    vi.useFakeTimers()
    const { MockWebSocket, mockWs: currentMock } = await import('./setup')
    const { connect, ZOMBIE_TIMEOUT } = await import('../src/ws.js')
    connect()
    currentMock.readyState = WebSocket.CONNECTING  // simulate stuck socket
    const callsBefore = MockWebSocket.mock.calls.length
    vi.advanceTimersByTime(ZOMBIE_TIMEOUT + 500)
    expect(MockWebSocket.mock.calls.length).toBe(callsBefore) // no auto-retry
    expect(document.getElementById('offline-overlay')!.dataset.state).toBe('idle')
    vi.useRealTimers()
  })

  test('zombie guard does not fire if socket opened successfully', async () => {
    vi.useFakeTimers()
    const { MockWebSocket } = await import('./setup')
    const { connect, ZOMBIE_TIMEOUT } = await import('../src/ws.js')
    connect()
    mockWs.onopen?.()                              // successful open
    const callsBefore = MockWebSocket.mock.calls.length
    vi.advanceTimersByTime(ZOMBIE_TIMEOUT + 1000)
    expect(MockWebSocket.mock.calls.length).toBe(callsBefore) // no spurious reconnect
    vi.useRealTimers()
  })
})

// ── Connect button ─────────────────────────────────────────────────────────

describe('connect button', () => {
  test('click creates new WebSocket', async () => {
    const { MockWebSocket } = await import('./setup')
    const callsBefore = MockWebSocket.mock.calls.length
    document.getElementById('offline-connect-btn')!.dispatchEvent(new Event('click'))
    expect(MockWebSocket.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  test('click shows connecting UI state', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.dataset.state = 'idle'
    document.getElementById('offline-connect-btn')!.dispatchEvent(new Event('click'))
    expect(overlay.dataset.state).toBe('connecting')
  })
})
