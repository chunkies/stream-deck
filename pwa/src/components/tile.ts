import { applyBg } from '../applyBg.js'
import { dom }     from '../state.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function createTile(comp: Component, _page: Page): HTMLElement {
  const cell = document.createElement('div')
  cell.className   = 'tile-cell'
  cell.dataset['key'] = `${_page.id}:${comp.id}`
  applyBg(cell, comp.color, comp.image)
  cell.innerHTML = '<div class="tile-label"></div><div class="tile-value">—</div>'
  cell.querySelector('.tile-label')!.textContent = comp.label ?? ''
  return cell
}

export function updateTile(key: string, text: string): void {
  const el = dom.grid.querySelector(`[data-key="${key}"] .tile-value`)
  if (!el) return
  el.textContent = text
  el.classList.remove('flash')
  void (el as HTMLElement).offsetWidth
  el.classList.add('flash')
}
