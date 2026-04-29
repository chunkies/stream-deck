// @ts-nocheck
// Note: circular imports with modal.ts and grid.ts are intentional —
// openModal / renderGrid are only called inside function bodies, never at module init.
import { state, adminPages, adminIdx } from './state'
import { pushConfig } from './config'
import { renderGrid } from './grid'
import { openModal } from './modal'

export function cpTypeIcon(compType) {
  const icons = { button: '🔲', switch: '🔘', slider: '🎚️', knob: '🎛️', tile: '📊', spotify: '🎵', voice: '🎤', 'plugin-tile': '🔌', folder: '📁' }
  return icons[compType] || '🔲'
}

export function compDefaults(compType) {
  const base = { label: '', color: '#1e293b' }
  switch (compType) {
    case 'button':      return { ...base, icon: '', action: { type: 'builtin', key: 'media.playPause' }, holdAction: null }
    case 'switch':      return { ...base, action: { type: 'toggle', on: '', off: '' } }
    case 'slider':      return { ...base, orientation: 'vertical', min: 0, max: 100, step: 5, defaultValue: 50, infiniteScroll: false, action: { type: 'volume' } }
    case 'knob':        return { ...base, min: 0, max: 100, step: 1, defaultValue: 50, infiniteScroll: false, action: { type: 'volume' } }
    case 'tile':        return { ...base, color: '#0f172a', pollCommand: '', pollInterval: 5 }
    case 'spotify':     return { color: '#0f172a', label: '', action: { type: 'builtin', key: 'media.playPause' } }
    case 'voice':       return { icon: '🎤', label: 'Voice', color: '#1e293b', voiceMode: 'smart' }
    case 'plugin-tile': return { ...base, color: '#0f172a', pluginTileId: '', pluginTileEvent: '', pluginTileField: 'value' }
    case 'folder':      return { icon: '📁', label: 'Folder', color: '#1e293b', pages: [{ id: `fp-${Date.now()}`, name: 'Page 1', components: [] }] }
    default: return base
  }
}

export function createComponentAtCell(compType, pluginKey, label, col, row, options = {}) {
  const page = adminPages()[adminIdx()]
  const id   = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const defs = compDefaults(compType)
  Object.assign(defs, options)
  if (pluginKey) defs.action = { type: 'plugin', pluginKey, params: {} }
  const comp = { id, col, row, colSpan: 1, rowSpan: 1, componentType: compType, ...defs }
  page.components.push(comp)
  pushConfig()
  renderGrid()
  openModal(adminIdx(), id, col, row)
}

function makeCpSection(title, items) {
  const section = document.createElement('div')
  section.className = 'cp-section'

  const hdr = document.createElement('div')
  hdr.className = 'cp-section-title cp-collapsible'
  const isCollapsed = state.cpCollapsed.has(title)
  hdr.innerHTML = `<span>${title}</span><span class="cp-chevron">${isCollapsed ? '▸' : '▾'}</span>`

  const grid = document.createElement('div')
  grid.className = 'cp-grid'
  if (isCollapsed) grid.style.display = 'none'

  hdr.addEventListener('click', () => {
    const collapsed = grid.style.display === 'none'
    grid.style.display = collapsed ? '' : 'none'
    hdr.querySelector('.cp-chevron').textContent = collapsed ? '▾' : '▸'
    if (collapsed) state.cpCollapsed.delete(title)
    else state.cpCollapsed.add(title)
  })

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'cp-item'
    el.draggable = true
    el.innerHTML = `<span class="cp-icon">${item.icon}</span><span class="cp-name">${item.label}</span><span class="cp-type">${item.compType}</span>`
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify({
        compType:  item.compType,
        pluginKey: item.pluginKey,
        label:     item.label,
        options:   item.options || {}
      }))
      e.dataTransfer.effectAllowed = 'copy'
    })
    grid.appendChild(el)
  }

  section.appendChild(hdr)
  section.appendChild(grid)
  return section
}

export function renderComponentPanel() {
  const panel = document.getElementById('component-panel')
  if (!panel) return
  panel.innerHTML = '<div class="cp-panel-title">Components</div>'

  const coreItems = [
    { compType: 'button', pluginKey: null, label: 'Button',    icon: '🔲', options: {} },
    { compType: 'switch', pluginKey: null, label: 'Switch',    icon: '🔘', options: {} },
    { compType: 'slider', pluginKey: null, label: 'Slider ↕',  icon: '🎚️', options: {} },
    { compType: 'slider', pluginKey: null, label: 'Slider ↔',  icon: '🎚️', options: { orientation: 'horizontal' } },
    { compType: 'knob',   pluginKey: null, label: 'Knob',      icon: '🎛️', options: {} },
    { compType: 'tile',   pluginKey: null, label: 'Info Tile', icon: '📊', options: {} },
    { compType: 'voice',  pluginKey: null, label: 'Voice',     icon: '🎤', options: {} },
    { compType: 'folder', pluginKey: null, label: 'Folder',    icon: '📁', options: {} },
  ]
  panel.appendChild(makeCpSection('Controls', coreItems))

  if (state.loadedPlugins.length) {
    const pluginsCollapsed = state.cpCollapsed.has('__plugins__')
    const pluginsHdr = document.createElement('div')
    pluginsHdr.className = 'cp-plugins-hdr cp-collapsible'
    pluginsHdr.innerHTML = `<span>Plugins</span><span class="cp-chevron">${pluginsCollapsed ? '▸' : '▾'}</span>`

    const pluginsBody = document.createElement('div')
    pluginsBody.className = 'cp-plugins-body'
    if (pluginsCollapsed) pluginsBody.style.display = 'none'

    pluginsHdr.addEventListener('click', () => {
      const collapsed = pluginsBody.style.display === 'none'
      pluginsBody.style.display = collapsed ? '' : 'none'
      pluginsHdr.querySelector('.cp-chevron').textContent = collapsed ? '▾' : '▸'
      if (collapsed) state.cpCollapsed.delete('__plugins__')
      else state.cpCollapsed.add('__plugins__')
    })

    for (const plugin of state.loadedPlugins) {
      if (!plugin.actions?.length) continue
      const items = plugin.actions.map(a => ({
        compType:  a.componentType || 'button',
        pluginKey: a.key,
        label:     a.label,
        icon:      cpTypeIcon(a.componentType || 'button'),
        options:   {}
      }))
      pluginsBody.appendChild(makeCpSection(plugin.name, items))
    }

    panel.appendChild(pluginsHdr)
    panel.appendChild(pluginsBody)
  }
}
