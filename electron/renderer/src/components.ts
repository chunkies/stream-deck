// Note: circular imports with modal.ts and grid.ts are intentional —
// openModal / renderGrid are only called inside function bodies, never at module init.
import type { Component, ComponentType } from '../../shared/types'
import { state, adminPages, adminIdx } from './state'
import { pushConfig } from './config'
import { renderGrid } from './grid'
import { openModal } from './modal'

export function cpTypeIcon(compType: string): string {
  const icons: Record<string, string> = {
    button: '🔲', switch: '🔘', slider: '🎚️', knob: '🎛️',
    tile: '📊', spotify: '🎵', voice: '🎤', 'plugin-tile': '🔌', folder: '📁',
    counter: '🔢', clock: '🕐', stopwatch: '⏱', countdown: '⏲', trackpad: '🖱️',
  }
  return icons[compType] ?? '🔲'
}

export function compDefaults(compType: ComponentType): Partial<Component> {
  const base: Partial<Component> = { label: '', color: '#1e293b' }
  switch (compType) {
    case 'button':      return { ...base, icon: '', action: { type: 'builtin', key: 'media.playPause' }, holdAction: null }
    case 'switch':      return { ...base, action: { type: 'toggle', on: '', off: '' } }
    case 'toggle':      return { ...base, action: { type: 'toggle', on: '', off: '' } }
    case 'slider':      return { ...base, orientation: 'vertical', min: 0, max: 100, step: 5, defaultValue: 50, infiniteScroll: false, action: { type: 'volume' } }
    case 'knob':        return { ...base, min: 0, max: 100, step: 1, defaultValue: 50, infiniteScroll: false, action: { type: 'volume' } }
    case 'tile':        return { ...base, color: '#0f172a', pollCommand: '', pollInterval: 5 }
    case 'spotify':     return { color: '#0f172a', label: '', action: { type: 'builtin', key: 'media.playPause' } }
    case 'voice':       return { icon: '🎤', label: 'Voice', color: '#1e293b', voiceMode: 'smart' }
    case 'plugin-tile': return { ...base, color: '#0f172a', pluginTileId: '', pluginTileEvent: '', pluginTileField: 'value' }
    case 'folder':      return { icon: '📁', label: 'Folder', color: '#1e293b', pages: [{ id: `fp-${Date.now()}`, name: 'Page 1', components: [] }] }
    case 'counter':     return { ...base, color: '#0f172a', counterMin: 0, counterMax: null, counterStep: 1 }
    case 'clock':       return { ...base, color: '#0f172a', clockFormat: 'HH:mm', clockShowDate: false }
    case 'stopwatch':   return { ...base, color: '#0f172a', stopwatchShowMs: false }
    case 'countdown':   return { ...base, color: '#0f172a', duration: 60, onComplete: null }
    case 'trackpad':    return { ...base, color: '#1a1a2e', trackpadSensitivity: 1.0, trackpadNaturalScroll: false }
  }
}

export function createComponentAtCell(
  compType: ComponentType,
  pluginKey: string | null,
  _label: string,
  col: number,
  row: number,
  options: Partial<Component> = {}
): void {
  const page = adminPages()[adminIdx()]
  const id   = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const defs = compDefaults(compType)
  Object.assign(defs, options)
  if (pluginKey) defs.action = { type: 'plugin', pluginKey, params: {} }
  const comp: Component = { id, col, row, colSpan: 1, rowSpan: 1, componentType: compType, ...defs }
  page.components.push(comp)
  pushConfig()
  renderGrid()
  openModal(adminIdx(), id, col, row)
}

interface CpItem {
  compType:  string
  pluginKey: string | null
  label:     string
  icon:      string
  options:   Partial<Component>
}

function makeCpSection(title: string, items: CpItem[]): HTMLElement {
  const section = document.createElement('div')
  section.className = 'cp-section'

  const hdr = document.createElement('div')
  hdr.className = 'cp-section-title cp-collapsible'
  const isCollapsed = state.cpCollapsed.has(title)
  const hdrTitle = document.createElement('span')
  hdrTitle.textContent = title
  const hdrChevron = document.createElement('span')
  hdrChevron.className = 'cp-chevron'
  hdrChevron.textContent = isCollapsed ? '▸' : '▾'
  hdr.appendChild(hdrTitle)
  hdr.appendChild(hdrChevron)

  const grid = document.createElement('div')
  grid.className = 'cp-grid'
  if (isCollapsed) grid.style.display = 'none'

  hdr.addEventListener('click', () => {
    const collapsed = grid.style.display === 'none'
    grid.style.display = collapsed ? '' : 'none'
    hdr.querySelector<HTMLElement>('.cp-chevron')!.textContent = collapsed ? '▾' : '▸'
    if (collapsed) state.cpCollapsed.delete(title)
    else state.cpCollapsed.add(title)
  })

  for (const item of items) {
    const itemEl = document.createElement('div')
    itemEl.className = 'cp-item'
    itemEl.draggable = true
    const iconSpan = document.createElement('span')
    iconSpan.className = 'cp-icon'
    iconSpan.textContent = item.icon
    const nameSpan = document.createElement('span')
    nameSpan.className = 'cp-name'
    nameSpan.textContent = item.label
    const typeSpan = document.createElement('span')
    typeSpan.className = 'cp-type'
    typeSpan.textContent = item.compType
    itemEl.appendChild(iconSpan)
    itemEl.appendChild(nameSpan)
    itemEl.appendChild(typeSpan)
    itemEl.addEventListener('dragstart', (e: DragEvent) => {
      if (!e.dataTransfer) return
      e.dataTransfer.setData('application/json', JSON.stringify({
        compType:  item.compType,
        pluginKey: item.pluginKey,
        label:     item.label,
        options:   item.options,
      }))
      e.dataTransfer.effectAllowed = 'copy'
    })
    grid.appendChild(itemEl)
  }

  section.appendChild(hdr)
  section.appendChild(grid)
  return section
}

export function renderComponentPanel(): void {
  const panel = document.getElementById('component-panel')
  if (!panel) return
  panel.innerHTML = '<div class="cp-panel-title">Components<span class="cp-drag-hint">drag onto grid</span></div>'

  const coreItems: CpItem[] = [
    { compType: 'button',    pluginKey: null, label: 'Button',    icon: '🔲', options: {} },
    { compType: 'switch',    pluginKey: null, label: 'Switch',    icon: '🔘', options: {} },
    { compType: 'slider',    pluginKey: null, label: 'Slider ↕',  icon: '🎚️', options: {} },
    { compType: 'slider',    pluginKey: null, label: 'Slider ↔',  icon: '🎚️', options: { orientation: 'horizontal' } },
    { compType: 'knob',      pluginKey: null, label: 'Knob',      icon: '🎛️', options: {} },
    { compType: 'tile',      pluginKey: null, label: 'Info Tile', icon: '📊', options: {} },
    { compType: 'voice',     pluginKey: null, label: 'Voice',     icon: '🎤', options: {} },
    { compType: 'folder',    pluginKey: null, label: 'Folder',    icon: '📁', options: {} },
    { compType: 'trackpad',  pluginKey: null, label: 'Trackpad',  icon: '🖱️', options: {} },
  ]
  panel.appendChild(makeCpSection('Controls', coreItems))

  const timerItems: CpItem[] = [
    { compType: 'counter',   pluginKey: null, label: 'Counter',   icon: '🔢', options: {} },
    { compType: 'clock',     pluginKey: null, label: 'Clock',     icon: '🕐', options: {} },
    { compType: 'stopwatch', pluginKey: null, label: 'Stopwatch', icon: '⏱', options: {} },
    { compType: 'countdown', pluginKey: null, label: 'Countdown', icon: '⏲', options: {} },
  ]
  panel.appendChild(makeCpSection('Timers', timerItems))

  if (state.loadedPlugins.length) {
    const pluginsCollapsed = state.cpCollapsed.has('__plugins__')
    const pluginsHdr = document.createElement('div')
    pluginsHdr.className = 'cp-plugins-hdr cp-collapsible'
    const phTitle = document.createElement('span')
    phTitle.textContent = 'Plugins'
    const phChevron = document.createElement('span')
    phChevron.className = 'cp-chevron'
    phChevron.textContent = pluginsCollapsed ? '▸' : '▾'
    pluginsHdr.appendChild(phTitle)
    pluginsHdr.appendChild(phChevron)

    const pluginsBody = document.createElement('div')
    pluginsBody.className = 'cp-plugins-body'
    if (pluginsCollapsed) pluginsBody.style.display = 'none'

    pluginsHdr.addEventListener('click', () => {
      const collapsed = pluginsBody.style.display === 'none'
      pluginsBody.style.display = collapsed ? '' : 'none'
      pluginsHdr.querySelector<HTMLElement>('.cp-chevron')!.textContent = collapsed ? '▾' : '▸'
      if (collapsed) state.cpCollapsed.delete('__plugins__')
      else state.cpCollapsed.add('__plugins__')
    })

    for (const plugin of state.loadedPlugins) {
      if (!plugin.actions?.length) continue
      const items: CpItem[] = plugin.actions.map(a => ({
        compType:  a.componentType ?? 'button',
        pluginKey: a.key,
        label:     a.label,
        icon:      cpTypeIcon(a.componentType ?? 'button'),
        options:   {},
      }))
      pluginsBody.appendChild(makeCpSection(plugin.name, items))
    }

    panel.appendChild(pluginsHdr)
    panel.appendChild(pluginsBody)
  }
}
