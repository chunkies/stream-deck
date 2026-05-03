import { applyBg } from '../applyBg.js'
import { send }    from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function createButton(comp: Component, page: Page): HTMLElement {
  const btn = document.createElement('div')
  btn.className = 'btn'
  btn.dataset['key'] = `${page.id}:${comp.id}`
  applyBg(btn, comp.color, comp.image)
  btn.innerHTML = '<div class="btn-icon"></div><div class="btn-label"></div>'
  btn.querySelector('.btn-icon')!.textContent  = comp.icon ?? ''
  btn.querySelector('.btn-label')!.textContent = comp.label ?? ''

  if (!comp.holdAction) {
    btn.addEventListener('pointerdown', () => {
      Haptic.tap()
      btn.classList.add('pressed')
      setTimeout(() => btn.classList.remove('pressed'), 150)
      send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
    })
  } else {
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let didHold = false

    btn.addEventListener('pointerdown', () => {
      didHold   = false
      holdTimer = setTimeout(() => {
        didHold   = true
        holdTimer = null
        Haptic.hold()
        btn.classList.add('holding')
        setTimeout(() => btn.classList.remove('holding'), 400)
        send({ type: 'press', pageId: page.id, compId: comp.id, hold: true })
      }, 500)
    })

    btn.addEventListener('pointerup', () => {
      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
      if (!didHold) {
        Haptic.tap()
        btn.classList.add('pressed')
        setTimeout(() => btn.classList.remove('pressed'), 150)
        send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
      }
    })

    btn.addEventListener('pointercancel', () => {
      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
    })
  }

  return btn
}
