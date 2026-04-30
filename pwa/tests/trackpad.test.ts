import { describe, test, expect, vi, beforeEach } from 'vitest'

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

  test('sends click button:2 on 2-finger tap', async () => {
    const { createTrackpad } = await import('../src/components/trackpad.js')
    const comp = { ...baseComp, id: 'tp4' }
    const el = createTrackpad(comp as any, basePage as any)
    document.body.appendChild(el)
    const s = el.querySelector('.trackpad-surface') as HTMLElement
    s.setPointerCapture = vi.fn()

    firePointer(s, 'pointerdown', 1, 50, 50)
    firePointer(s, 'pointerdown', 2, 60, 50)
    firePointer(s, 'pointerup',   1, 50, 50)

    const msg = lastSent()
    expect(msg?.event).toBe('click')
    expect(msg?.button).toBe(2)

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
})
