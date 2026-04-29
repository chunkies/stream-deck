import { describe, test, expect, beforeEach } from 'vitest'
import { mockWs } from './setup'
import { state } from '../../../pwa/src/state.js'

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
  const { connect } = await import('../../../pwa/src/ws.js')
  connect()
  // Seed config so navigate/toggleState tests have context
  state.config       = structuredClone(baseConfig)
  state.currentPages = state.config.pages
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
    state.navStack = [{ prevPages: [], prevIdx: 0, prevName: 'Root' }]
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
    state.navStack = [{ prevPages: [], prevIdx: 0, prevName: 'Root' }]
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
    expect(state.currentPages).toBe(state.config.pages)
    expect(state.config.pages[0].id).toBe('fresh')
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

  test('onclose sets status to Reconnecting', async () => {
    mockWs.onclose?.()
    expect(document.getElementById('ws-status')!.textContent).toBe('Reconnecting…')
  })

  test('onclose adds visible to offline overlay', async () => {
    const overlay = document.getElementById('offline-overlay')!
    overlay.classList.remove('visible')
    mockWs.onclose?.()
    expect(overlay.classList.contains('visible')).toBe(true)
  })
})
