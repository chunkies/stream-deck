import { applyBg } from '../applyBg.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function createClock(comp: Component, page: Page): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tile-cell clock-tile'
  el.dataset['key'] = `${page.id}:${comp.id}`
  applyBg(el, comp.color, comp.image)
  el.style.cssText += ';pointer-events:none'

  const label = document.createElement('div')
  label.className   = 'tile-label'
  label.textContent = comp.label ?? ''

  const val = document.createElement('div')
  val.className   = 'tile-value'
  val.style.cssText = 'font-variant-numeric:tabular-nums'
  val.textContent = '--:--'

  el.appendChild(label)
  el.appendChild(val)
  return el
}
