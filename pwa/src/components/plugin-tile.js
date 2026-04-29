import { applyBg } from '../applyBg.js'

export function createPluginTile(comp, page) {
  const cell = document.createElement('div')
  cell.className          = 'tile-cell plugin-tile-cell'
  cell.dataset.pluginId   = comp.pluginTileId    || ''
  cell.dataset.eventName  = comp.pluginTileEvent || ''
  cell.dataset.field      = comp.pluginTileField || 'value'
  applyBg(cell, comp.color, comp.image)
  cell.innerHTML = `
    <div class="tile-label">${comp.label || ''}</div>
    <div class="tile-value">—</div>
  `
  return cell
}

export function updatePluginTile(pluginId, eventName, msg) {
  document.querySelectorAll('.plugin-tile-cell').forEach(cell => {
    if (cell.dataset.pluginId !== pluginId) return
    if (cell.dataset.eventName !== eventName) return
    const field = cell.dataset.field || 'value'
    const val   = msg[field] ?? msg.value ?? JSON.stringify(msg)
    const el    = cell.querySelector('.tile-value')
    if (!el) return
    el.textContent = val
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  })
}
