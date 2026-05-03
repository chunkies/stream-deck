import { applyBg } from '../applyBg.js'
import { send }    from '../ws.js'
import type { Component, Page, GestureType } from '../../../electron/shared/types.js'

const FRAME_MS        = 50   // ~20 fps cap for move events
const TAP_MS          = 200  // max duration for a tap gesture
const TAP_DIST        = 10   // max pixel movement to qualify as a tap
const SWIPE_MIN_DIST  = 40   // min px for a swipe
const SWIPE_ANGLE_MAX = 0.7  // max |minor/major| ratio for a clean swipe
const LONG_PRESS_MS   = 600  // hold time for long press
const DOUBLE_TAP_MS   = 300  // max gap between two taps for double tap
const PINCH_MIN_DELTA = 40   // min change in finger distance for a pinch gesture

export function createTrackpad(comp: Component, page: Page): HTMLElement {
  const sensitivity   = comp.trackpadSensitivity  ?? 1.0
  const naturalScroll = comp.trackpadNaturalScroll ?? false

  const cell = document.createElement('div')
  cell.className = 'trackpad-cell'
  applyBg(cell, comp.color, comp.image)

  const label = document.createElement('div')
  label.className = 'trackpad-label'
  label.textContent = comp.label ?? ''
  cell.appendChild(label)

  const surface = document.createElement('div')
  surface.className = 'trackpad-surface'
  cell.appendChild(surface)

  // pointer tracking state
  let pointer1: { id: number; x: number; y: number; startX: number; startY: number; t: number } | null = null
  let pointer2: { id: number; x: number; y: number; startX: number; startY: number } | null = null
  let lastFrameAt  = 0
  let didMove      = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let lastTapAt    = 0
  let pinchStartDist = 0

  function clearLongPress(): void {
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null }
  }

  surface.addEventListener('pointerdown', (e: PointerEvent) => {
    surface.setPointerCapture(e.pointerId)
    e.preventDefault()

    if (!pointer1) {
      pointer1 = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: Date.now() }
      didMove  = false

      // Start long-press timer (single finger only)
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        if (!pointer2 && !didMove) {
          send({ type: 'gesture', name: 'longPress', pageId: page.id, compId: comp.id })
          Haptic.hold()
        }
      }, LONG_PRESS_MS)

    } else if (!pointer2) {
      pointer2 = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }
      clearLongPress()
      pinchStartDist = Math.hypot(
        e.clientX - pointer1.x,
        e.clientY - pointer1.y
      )
    }
  }, { passive: false })

  surface.addEventListener('pointermove', (e: PointerEvent) => {
    e.preventDefault()
    const now = Date.now()
    if (now - lastFrameAt < FRAME_MS) return

    if (pointer1 && pointer1.id === e.pointerId) {
      const dx = (e.clientX - pointer1.x) * sensitivity
      const dy = (e.clientY - pointer1.y) * sensitivity

      if (!pointer2) {
        // 1-finger: move mouse
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          send({ type: 'trackpad', event: 'move', dx, dy, pageId: page.id, compId: comp.id })
          lastFrameAt = now
          didMove = true
          clearLongPress()
        }
      } else {
        // 2-finger: check for pinch first (distance change), then scroll
        const newDist = Math.hypot(e.clientX - pointer2.x, e.clientY - pointer2.y)
        const delta   = newDist - pinchStartDist
        if (Math.abs(delta) > PINCH_MIN_DELTA) {
          const name = delta < 0 ? 'pinchIn' : 'pinchOut'
          send({ type: 'gesture', name, pageId: page.id, compId: comp.id })
          pinchStartDist = newDist
          didMove = true
        } else {
          const scrollDy = naturalScroll ? -dy : dy
          if (Math.abs(scrollDy) > 0.5) {
            send({ type: 'trackpad', event: 'scroll', dy: scrollDy, pageId: page.id, compId: comp.id })
            lastFrameAt = now
            didMove = true
          }
        }
      }
      pointer1.x = e.clientX
      pointer1.y = e.clientY

    } else if (pointer2 && pointer2.id === e.pointerId) {
      if (pointer1) {
        const newDist = Math.hypot(e.clientX - pointer1.x, e.clientY - pointer1.y)
        const delta   = newDist - pinchStartDist
        if (Math.abs(delta) > PINCH_MIN_DELTA) {
          const name = delta < 0 ? 'pinchIn' : 'pinchOut'
          send({ type: 'gesture', name, pageId: page.id, compId: comp.id })
          pinchStartDist = newDist
          didMove = true
        }
      }
      pointer2.x = e.clientX
      pointer2.y = e.clientY
    }
  }, { passive: false })

  surface.addEventListener('pointerup', (e: PointerEvent) => {
    e.preventDefault()
    clearLongPress()

    if (pointer1 && pointer1.id === e.pointerId) {
      const dt   = Date.now() - pointer1.t
      const dx   = e.clientX - pointer1.startX
      const dy   = e.clientY - pointer1.startY
      const dist = Math.hypot(dx, dy)
      const isTap = dt < TAP_MS && dist < TAP_DIST && !didMove

      if (pointer2 && isTap) {
        // Two-finger tap
        send({ type: 'gesture', name: 'twoFingerTap', pageId: page.id, compId: comp.id })
        Haptic.tap()
      } else if (isTap) {
        // Check double tap
        const now = Date.now()
        if (now - lastTapAt < DOUBLE_TAP_MS) {
          send({ type: 'gesture', name: 'doubleTap', pageId: page.id, compId: comp.id })
          lastTapAt = 0
          Haptic.tap()
        } else {
          lastTapAt = now
          send({ type: 'trackpad', event: 'click', button: 1, pageId: page.id, compId: comp.id })
          Haptic.tap()
        }
      } else if (!didMove && dist >= SWIPE_MIN_DIST) {
        // Swipe detection
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)
        const ratio = Math.min(absDx, absDy) / Math.max(absDx, absDy)
        if (ratio <= SWIPE_ANGLE_MAX) {
          let name: GestureType
          if (absDx > absDy) {
            name = dx > 0 ? 'swipeRight' : 'swipeLeft'
          } else {
            name = dy > 0 ? 'swipeDown' : 'swipeUp'
          }
          send({ type: 'gesture', name, pageId: page.id, compId: comp.id })
          Haptic.tap()
        }
      }

      pointer1 = null
      pointer2 = null
      didMove  = false

    } else if (pointer2 && pointer2.id === e.pointerId) {
      pointer2 = null
    }
  }, { passive: false })

  surface.addEventListener('pointercancel', (e: PointerEvent) => {
    clearLongPress()
    if (pointer1?.id === e.pointerId) { pointer1 = null; pointer2 = null; didMove = false }
    else if (pointer2?.id === e.pointerId) { pointer2 = null }
  })

  // Right-click: 3-finger tap simulation via contextmenu on surface
  surface.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault()
    send({ type: 'trackpad', event: 'click', button: 3, pageId: page.id, compId: comp.id })
    Haptic.tap()
  })

  return cell
}
