import { applyBg } from '../applyBg.js'
import { dom }     from '../state.js'
import type { Component, Page, ServerMessage } from '../../../electron/shared/types.js'

export function createTile(comp: Component, _page: Page): HTMLElement {
  const cell = document.createElement('div')
  cell.className   = 'tile-cell'
  cell.dataset['key'] = `${_page.id}:${comp.id}`
  if (comp.pluginTileId)    cell.dataset['pluginId']  = comp.pluginTileId
  if (comp.pluginTileEvent) cell.dataset['eventName'] = comp.pluginTileEvent
  if (comp.pluginTileField) cell.dataset['field']     = comp.pluginTileField
  applyBg(cell, comp.color, comp.image)
  cell.innerHTML = '<div class="tile-label"></div><div class="tile-value">—</div>'
  cell.querySelector('.tile-label')!.textContent = comp.label ?? ''
  return cell
}

export function updateTileFromEvent(pluginId: string, eventName: string, msg: ServerMessage & { type: 'pluginEvent' }): void {
  document.querySelectorAll<HTMLElement>('.tile-cell').forEach(cell => {
    if (cell.dataset['pluginId'] !== pluginId) return
    if (cell.dataset['eventName'] !== eventName) return
    const field = cell.dataset['field'] ?? 'value'
    const raw   = msg as Record<string, unknown>
    const val   = raw[field] ?? raw['value'] ?? JSON.stringify(msg)
    const el    = cell.querySelector('.tile-value')
    if (!el) return
    el.textContent = String(val)
    el.classList.remove('flash')
    void (el as HTMLElement).offsetWidth
    el.classList.add('flash')
    if (typeof raw['color'] === 'string') cell.style.backgroundColor = raw['color']
  })
}

export function updateTile(key: string, text: string): void {
  const el = dom.grid.querySelector(`[data-key="${key}"] .tile-value`)
  if (!el) return
  el.textContent = text
  el.classList.remove('flash')
  void (el as HTMLElement).offsetWidth
  el.classList.add('flash')
}

export function flashTile(key: string, color: string, ms: number): void {
  const el = dom.grid.querySelector<HTMLElement>(`[data-key="${key}"]`)
  if (!el) return
  const prev = el.style.backgroundColor
  el.style.transition = `background-color 80ms ease`
  el.style.backgroundColor = color
  setTimeout(() => {
    el.style.backgroundColor = prev
    setTimeout(() => { el.style.transition = '' }, 80)
  }, ms)
}

export interface WidgetUpdate {
  label?: string
  color?: string
  icon?:  string
  image?: string | null
  badge?: string
}

export function applyWidgetUpdate(key: string, opts: WidgetUpdate, targets?: string[]): void {
  // If server provided resolved targets, use them for O(1) lookup
  const keys = targets && targets.length > 0
    ? targets
    : [key]  // fallback: use key itself as data-key lookup

  for (const k of keys) {
    // Try data-key first (pageId:compId address)
    let el = dom.grid.querySelector<HTMLElement>(`[data-key="${k}"]`)
    // Then try data-display-key (pluginDisplayKey address)
    if (!el) el = dom.grid.querySelector<HTMLElement>(`[data-display-key="${key}"]`)
    if (!el) continue

    if (opts.label !== undefined) {
      const labelEl = el.querySelector('.btn-label, .tile-label, .switch-label, .slider-label, .knob-label, .trackpad-label')
      if (labelEl) labelEl.textContent = opts.label
    }
    if (opts.badge !== undefined) {
      const valEl = el.querySelector('.tile-value, .btn-badge, .switch-badge')
      if (valEl) valEl.textContent = opts.badge
    }
    if (opts.color !== undefined) {
      el.style.backgroundColor = opts.color
    }
    if (opts.icon !== undefined) {
      const iconEl = el.querySelector('.btn-icon, .tile-icon, .switch-icon')
      if (iconEl) iconEl.textContent = opts.icon
    }
    // image handled by applyBg — skip for now (complex, requires full applyBg)
  }
}
