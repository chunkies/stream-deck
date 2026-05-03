import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ws module so send() is captured without needing a live WebSocket
const mockSend = vi.fn()
vi.mock('../src/ws.js', () => ({ send: mockSend }))

const baseComp = {
  id: 'tp1', col: 1, row: 1, colSpan: 2, rowSpan: 2,
  componentType: 'trackpad' as const,
  label: 'Pad',
  color: '#1a1a2e',
  trackpadSensitivity: 1.0,
  trackpadNaturalScroll: false,
}
const basePage = { id: 'p1', name: 'Main', components: [] }

function firePointer(el: HTMLElement, type: string, pointerId: number, clientX: number, clientY: number): void {
  const evt = new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX, clientY, pointerId,
  })
  el.dispatchEvent(evt)
}

function lastSent(): any {
  const calls = mockSend.mock.calls
  if (!calls.length) return null
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  mockSend.mockClear()
})

describe('createTrackpad', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders trackpad-cell with label and surface', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const el = createTrackpad(baseComp as any, basePage as any)
    expect(el.classList.contains('trackpad-cell')).toBe(true)
    expect(el.querySelector('.trackpad-label')!.textContent).toBe('Pad')
    expect(el.querySelector('.trackpad-surface')).not.toBeNull()
  })

  test('sends move on 1-finger drag', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const el = createTrackpad(baseComp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 100, 100)
    firePointer(s, 'pointermove', 1, 115, 108)

    const msg = lastSent()
    expect(msg).not.toBeNull()
    expect(msg.type).toBe('trackpad')
    expect(msg.event).toBe('move')
    expect(typeof msg.dx).toBe('number')
    expect(typeof msg.dy).toBe('number')

    document.body.removeChild(el)
  })

  test('applies sensitivity multiplier to move deltas', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp2', trackpadSensitivity: 2.0 }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointermove', 1, 10, 5)

    const msg = lastSent()
    expect(msg?.dx).toBe(20)
    expect(msg?.dy).toBe(10)

    document.body.removeChild(el)
  })

  test('sends click button:1 on quick 1-finger tap', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp3' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerup',   1, 50, 50)

    const msg = lastSent()
    expect(msg?.type).toBe('trackpad')
    expect(msg?.event).toBe('click')
    expect(msg?.button).toBe(1)

    document.body.removeChild(el)
  })

  test('sends twoFingerTap gesture on 2-finger tap', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp4' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerdown', 2, 60, 50)
    firePointer(s, 'pointerup',   1, 50, 50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg?.[0]?.name).toBe('twoFingerTap')

    document.body.removeChild(el)
  })

  test('sends scroll on 2-finger drag', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp5' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerdown', 2, 60, 50)
    firePointer(s, 'pointermove', 1, 50, 80)

    const msg = lastSent()
    expect(msg?.type).toBe('trackpad')
    expect(msg?.event).toBe('scroll')
    expect(typeof msg?.dy).toBe('number')

    document.body.removeChild(el)
  })

  test('natural scroll reverses dy direction', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp6', trackpadNaturalScroll: true }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // finger drags down (clientY increases by 30) → natural scroll sends negative dy
    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerdown', 2, 60, 50)
    firePointer(s, 'pointermove', 1, 50, 80)

    const msg = lastSent()
    expect(msg?.dy).toBeLessThan(0)

    document.body.removeChild(el)
  })

  test('sends right-click on contextmenu', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp7' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement

    s.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    const msg = lastSent()
    expect(msg?.event).toBe('click')
    expect(msg?.button).toBe(3)

    document.body.removeChild(el)
  })

  test('does not send click after drag beyond tap threshold', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp8' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointermove', 1, 50, 50)  // exceeds TAP_DIST=10
    firePointer(s, 'pointerup',   1, 50, 50)

    // Any messages should be 'move', not 'click'
    const clickMsg = mockSend.mock.calls.find(c => c[0]?.event === 'click')
    expect(clickMsg).toBeUndefined()

    document.body.removeChild(el)
  })

  test('pointercancel resets state without sending', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp9' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    mockSend.mockClear()
    firePointer(s, 'pointercancel', 1, 50, 50)

    expect(mockSend).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  // ── Gesture detection tests ────────────────────────────────────────────────

  test('swipe right sends gesture swipeRight', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp10', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointerup',   1, 60, 5)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('swipeRight')
    expect(gestureMsg![0].pageId).toBe('p1')
    expect(gestureMsg![0].compId).toBe('tp10')

    document.body.removeChild(el)
  })

  test('swipe left sends gesture swipeLeft', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp11', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 60, 0)
    firePointer(s, 'pointerup',   1, 0, 5)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('swipeLeft')

    document.body.removeChild(el)
  })

  test('swipe up sends gesture swipeUp', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp12', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 60)
    firePointer(s, 'pointerup',   1, 5, 0)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('swipeUp')

    document.body.removeChild(el)
  })

  test('swipe down sends gesture swipeDown', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp13', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointerup',   1, 5, 60)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('swipeDown')

    document.body.removeChild(el)
  })

  test('long press sends gesture longPress after 600ms', async () => {
    vi.useFakeTimers()
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp14', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    // no movement
    vi.advanceTimersByTime(700)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('longPress')
    expect(gestureMsg![0].pageId).toBe('p1')
    expect(gestureMsg![0].compId).toBe('tp14')

    document.body.removeChild(el)
    vi.useRealTimers()
  })

  test('double tap sends gesture doubleTap', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp15', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // First tap
    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerup',   1, 50, 50)
    // Second tap immediately (within DOUBLE_TAP_MS=300ms)
    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerup',   1, 50, 50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeDefined()
    expect(gestureMsg![0].name).toBe('doubleTap')

    document.body.removeChild(el)
  })

  test('swipe below min distance does not send gesture', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp16', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // 20px — between TAP_DIST(10) and SWIPE_MIN_DIST(40), so not a tap and not a swipe
    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointerup',   1, 20, 0)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeUndefined()

    document.body.removeChild(el)
  })

  test('diagonal swipe (equal dx and dy) does not send gesture', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp17', action: { type: 'plugin' as const, pluginKey: 'test.gesture' } }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // 45-degree diagonal: dx == dy == 50, ratio = 1.0 > SWIPE_ANGLE_MAX(0.7)
    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointerup',   1, 50, 50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeUndefined()

    document.body.removeChild(el)
  })

  test('sends swipe gesture regardless of component action type', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp18' }  // no action — gestures still sent
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointerup',   1, 60, 5)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg?.[0]?.name).toBe('swipeRight')

    document.body.removeChild(el)
  })

  test('trackpad move, scroll, and click messages include pageId and compId', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')

    // Move — fresh element
    const comp = { ...baseComp, id: 'tp19' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 0, 0)
    firePointer(s, 'pointermove', 1, 20, 10)
    const moveMsg = mockSend.mock.calls.find(c => c[0]?.event === 'move')
    expect(moveMsg![0].pageId).toBe('p1')
    expect(moveMsg![0].compId).toBe('tp19')
    document.body.removeChild(el)
    mockSend.mockClear()

    // Scroll (2-finger) — fresh element to avoid FRAME_MS throttle
    const comp2 = { ...baseComp, id: 'tp19s' }
    const el2 = createTrackpad(comp2 as any, basePage as any)
    document.body.appendChild(el2)
    const s2 = el2.querySelector('.trackpad-surface') as HTMLElement
    s2.setPointerCapture = vi.fn()
    firePointer(s2, 'pointerdown', 1, 10, 0)
    firePointer(s2, 'pointerdown', 2, 20, 0)
    firePointer(s2, 'pointermove', 1, 10, 40)
    const scrollMsg = mockSend.mock.calls.find(c => c[0]?.event === 'scroll')
    expect(scrollMsg![0].pageId).toBe('p1')
    expect(scrollMsg![0].compId).toBe('tp19s')
    document.body.removeChild(el2)
    mockSend.mockClear()

    // Click (tap) — fresh element
    const comp3 = { ...baseComp, id: 'tp19b' }
    const el3 = createTrackpad(comp3 as any, basePage as any)
    document.body.appendChild(el3)
    const s3 = el3.querySelector('.trackpad-surface') as HTMLElement
    s3.setPointerCapture = vi.fn()
    firePointer(s3, 'pointerdown', 1, 50, 50)
    firePointer(s3, 'pointerup',   1, 50, 50)
    const clickMsg = mockSend.mock.calls.find(c => c[0]?.event === 'click')
    expect(clickMsg![0].pageId).toBe('p1')
    expect(clickMsg![0].compId).toBe('tp19b')

    document.body.removeChild(el3)
  })

  test('sends pinchIn when fingers move closer together', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp20' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // Two fingers start 100px apart; pointer1 moves to shrink distance to ~10px
    firePointer(s, 'pointerdown', 1, 0,   50)
    firePointer(s, 'pointerdown', 2, 100, 50)
    firePointer(s, 'pointermove', 1, 90,  50)  // distance shrinks from 100 to 10
    firePointer(s, 'pointerup',   1, 90,  50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg?.[0]?.name).toBe('pinchIn')

    document.body.removeChild(el)
  })

  test('sends pinchOut when fingers move farther apart', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp21' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // Two fingers start 20px apart; pointer1 moves to grow distance to 80px
    firePointer(s, 'pointerdown', 1, 50,  50)
    firePointer(s, 'pointerdown', 2, 70,  50)
    firePointer(s, 'pointermove', 1, 0,   50)  // distance grows from 20 to 70
    firePointer(s, 'pointerup',   1, 0,   50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg?.[0]?.name).toBe('pinchOut')

    document.body.removeChild(el)
  })

  test('no pinch when finger distance change is below threshold', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp22' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    // Two fingers start 100px apart; pointer1 moves only 10px (below 30px threshold)
    firePointer(s, 'pointerdown', 1, 0,   50)
    firePointer(s, 'pointerdown', 2, 100, 50)
    firePointer(s, 'pointermove', 1, 10,  50)  // distance changes by only 10px
    firePointer(s, 'pointerup',   1, 10,  50)

    const gestureMsg = mockSend.mock.calls.find(c => c[0]?.type === 'gesture')
    expect(gestureMsg).toBeUndefined()

    document.body.removeChild(el)
  })
})
