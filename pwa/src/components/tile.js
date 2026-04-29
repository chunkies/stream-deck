import { applyBg } from '../applyBg.js'
import { dom }     from '../state.js'

export function createTile(comp, page) {
  const cell = document.createElement('div')
  cell.className   = 'tile-cell'
  cell.dataset.key = `${page.id}:${comp.id}`
  applyBg(cell, comp.color, comp.image)
  cell.innerHTML = `
    <div class="tile-label">${comp.label || ''}</div>
    <div class="tile-value">—</div>
  `
  return cell
}

export function updateTile(key, text) {
  const el = dom.grid.querySelector(`[data-key="${key}"] .tile-value`)
  if (!el) return
  el.textContent = text
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
}
