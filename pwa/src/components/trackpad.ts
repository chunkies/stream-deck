import { applyBg } from '../applyBg.js'
import { send }    from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

const FRAME_MS   = 50  // ~20 fps cap for move events
const TAP_MS     = 200 // max duration for a tap gesture
const TAP_DIST   = 10  // max pixel movement to qualify as a tap

export function createTrackpad(comp: Component, _page: Page): HTMLElement {
  const sensitivity      = comp.trackpadSensitivity    ?? 1.0
  const naturalScroll    = comp.trackpadNaturalScroll   ?? false

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
  let pointer2: { id: number; x: number; y: number } | null = null
  let lastFrameAt = 0
  let didMove = false

  surface.addEventListener('pointerdown', (e: PointerEvent) => {
    surface.setPointerCapture(e.pointerId)
    e.preventDefault()

    if (!pointer1) {
      pointer1 = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: Date.now() }
      didMove = false
    } else if (!pointer2) {
      pointer2 = { id: e.pointerId, x: e.clientX, y: e.clientY }
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
          send({ type: 'trackpad', event: 'move', dx, dy })
          lastFrameAt = now
          didMove = true
        }
      } else {
        // 2-finger: scroll
        const scrollDy = naturalScroll ? -dy : dy
        if (Math.abs(scrollDy) > 0.5) {
          send({ type: 'trackpad', event: 'scroll', dy: scrollDy })
          lastFrameAt = now
          didMove = true
        }
      }
      pointer1.x = e.clientX
      pointer1.y = e.clientY

    } else if (pointer2 && pointer2.id === e.pointerId) {
      pointer2.x = e.clientX
      pointer2.y = e.clientY
    }
  }, { passive: false })

  surface.addEventListener('pointerup', (e: PointerEvent) => {
    e.preventDefault()

    if (pointer1 && pointer1.id === e.pointerId) {
      const dt    = Date.now() - pointer1.t
      const dist  = Math.hypot(e.clientX - pointer1.startX, e.clientY - pointer1.startY)
      const isTap = dt < TAP_MS && dist < TAP_DIST && !didMove

      if (isTap) {
        const button = pointer2 ? 2 : 1
        send({ type: 'trackpad', event: 'click', button: button as 1 | 2 })
        Haptic.tap()
      }

      pointer1 = null
      pointer2 = null
      didMove  = false

    } else if (pointer2 && pointer2.id === e.pointerId) {
      pointer2 = null
    }
  }, { passive: false })

  surface.addEventListener('pointercancel', (e: PointerEvent) => {
    if (pointer1?.id === e.pointerId) { pointer1 = null; pointer2 = null; didMove = false }
    else if (pointer2?.id === e.pointerId) { pointer2 = null }
  })

  // Right-click: 3-finger tap simulation via contextmenu on surface
  surface.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault()
    send({ type: 'trackpad', event: 'click', button: 3 })
    Haptic.tap()
  })

  return cell
}
