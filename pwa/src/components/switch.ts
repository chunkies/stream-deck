import { state, dom } from '../state.js'
import { applyBg }    from '../applyBg.js'
import { send }       from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function createSwitch(comp: Component, page: Page): HTMLElement {
  const key    = `${page.id}:${comp.id}`
  const active = state.toggleStates[key] ?? comp.activeDefault ?? false
  const cell   = document.createElement('div')

  cell.className      = 'switch-cell' + (active ? ' active' : '')
  cell.dataset['key']    = key
  cell.dataset['compId'] = comp.id
  cell.dataset['pageId'] = page.id
  applyBg(cell, comp.color, comp.image)

  cell.innerHTML = '<div class="switch-icon"></div><div class="switch-label"></div><div class="switch-track"><div class="switch-thumb"></div></div><div class="switch-badge"></div>'
  cell.querySelector('.switch-icon')!.textContent  = comp.icon  ?? ''
  cell.querySelector('.switch-label')!.textContent = comp.label ?? ''

  cell.addEventListener('pointerdown', () => {
    Haptic.tap()
    cell.classList.add('pressed')
    setTimeout(() => cell.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
  })

  return cell
}

export function updateToggleBtn(key: string, active: boolean): void {
  const el = dom.grid.querySelector(`[data-key="${key}"]`)
  if (!el) return
  el.classList.toggle('active', active)
}
