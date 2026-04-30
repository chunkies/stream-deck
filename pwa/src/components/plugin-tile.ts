import { applyBg } from '../applyBg.js'
import type { Component, Page, ServerMessage } from '../../../electron/shared/types.js'

export function createPluginTile(comp: Component, _page: Page): HTMLElement {
  const cell = document.createElement('div')
  cell.className            = 'tile-cell plugin-tile-cell'
  cell.dataset['pluginId']  = comp.pluginTileId    ?? ''
  cell.dataset['eventName'] = comp.pluginTileEvent ?? ''
  cell.dataset['field']     = comp.pluginTileField ?? 'value'
  applyBg(cell, comp.color, comp.image)
  cell.innerHTML = '<div class="tile-label"></div><div class="tile-value">—</div>'
  cell.querySelector('.tile-label')!.textContent = comp.label ?? ''
  return cell
}

export function updatePluginTile(pluginId: string, eventName: string, msg: ServerMessage & { type: 'pluginEvent' }): void {
  document.querySelectorAll<HTMLElement>('.plugin-tile-cell').forEach(cell => {
    if (cell.dataset['pluginId'] !== pluginId) return
    if (cell.dataset['eventName'] !== eventName) return
    const field = cell.dataset['field'] ?? 'value'
    const val   = (msg as Record<string, unknown>)[field] ?? msg['value'] ?? JSON.stringify(msg)
    const el    = cell.querySelector('.tile-value')
    if (!el) return
    el.textContent = String(val)
    el.classList.remove('flash')
    void (el as HTMLElement).offsetWidth
    el.classList.add('flash')
  })
}
