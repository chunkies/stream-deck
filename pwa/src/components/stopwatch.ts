import { applyBg } from '../applyBg.js'
import type { Component, Page } from '../../../electron/shared/types.js'
import { send } from '../ws.js'

export function createStopwatch(comp: Component, page: Page): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tile-cell stopwatch-tile'
  el.dataset['key'] = `${page.id}:${comp.id}`
  applyBg(el, comp.color, comp.image)
  el.style.cssText += ';cursor:pointer'

  const label = document.createElement('div')
  label.className   = 'tile-label'
  label.textContent = comp.label ?? ''

  const val = document.createElement('div')
  val.className   = 'tile-value'
  val.style.cssText = 'font-variant-numeric:tabular-nums'
  val.textContent = '00:00'

  el.appendChild(label)
  el.appendChild(val)

  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let holdFired = false

  el.addEventListener('pointerdown', () => {
    holdFired = false
    holdTimer = setTimeout(() => {
      holdFired = true
      holdTimer = null
      send({ type: 'press', pageId: page.id, compId: comp.id, hold: true })
    }, 600)
  })

  el.addEventListener('pointerup', () => {
    if (holdTimer) {
      clearTimeout(holdTimer)
      holdTimer = null
      if (!holdFired) send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
    }
  })

  el.addEventListener('pointercancel', () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  })

  return el
}
