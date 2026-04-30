import { describe, test, expect, vi } from 'vitest'
import { mockWs } from './setup'

describe('WebSocket message handling', () => {
  test('does not throw on malformed JSON', async () => {
    const { connect } = await import('../src/ws.js')
    connect()

    expect(() => {
      mockWs.onmessage?.({ data: 'not json at all' })
    }).not.toThrow()
  })

  test('does not throw on empty message', () => {
    expect(() => {
      mockWs.onmessage?.({ data: '' })
    }).not.toThrow()
  })

  test('does not throw on null data', () => {
    expect(() => {
      mockWs.onmessage?.({ data: 'null' })
    }).not.toThrow()
  })

  test('config message sets state', async () => {
    const { state } = await import('../src/state.js')
    const { connect } = await import('../src/ws.js')
    connect()

    const config = { grid: { cols: 3, rows: 4 }, pages: [{ id: 'p1', name: 'Page 1', components: [] }] }
    mockWs.onmessage?.({ data: JSON.stringify({ type: 'config', config }) })

    expect(state.config).toEqual(config)
    expect(state.currentPageIdx).toBe(0)
    expect(state.navStack).toEqual([])
    expect(state.toggleStates).toEqual({})
  })

  test('send only fires when WebSocket is open', async () => {
    const { send } = await import('../src/ws.js')

    mockWs.readyState = 1  // OPEN
    send({ type: 'press', pageId: 'p1', compId: 'c1', hold: false })
    expect(mockWs.send).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    mockWs.readyState = 3  // CLOSED
    send({ type: 'press', pageId: 'p1', compId: 'c1', hold: false })
    expect(mockWs.send).not.toHaveBeenCalled()
  })
})
