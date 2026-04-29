// @ts-nocheck
// Note: circular imports with grid.ts and plugins.ts are intentional —
// all cross-module calls happen inside function bodies, never at module init.
import { state, adminPages, adminIdx } from './state'
import { BUILTIN_ACTIONS, SLIDER_ACTION_TYPES, SWITCH_ACTION_TYPES } from './constants'
import { renderPluginParams, collectPluginParams } from './plugins'
import { setAppearanceFromComp, getAppearanceFields } from './appearance'
import { pushConfig } from './config'
import { renderGrid } from './grid'

// ── Component type tabs ────────────────────────────────
export function setCompType(type) {
  state.currentCompType = type
  const uiType = type === 'toggle' ? 'switch' : type
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === uiType))
  for (const t of ['button', 'switch', 'slider', 'knob', 'spotify', 'tile', 'voice', 'plugin-tile', 'folder']) {
    const el = document.getElementById(`comp-${t}`)
    if (el) el.style.display = t === uiType ? 'block' : 'none'
  }
}

// ── Action field visibility ────────────────────────────
export function showActionFields(prefix, types, type) {
  for (const t of types) {
    document.getElementById(`${prefix}-action-${t}`).style.display = t === type ? '' : 'none'
  }
}

export function showButtonActionFields(type) {
  for (const t of ['builtin', 'hotkey', 'command', 'sequence', 'page']) {
    document.getElementById(`action-${t}`).style.display = t === type ? 'block' : 'none'
  }
  if (type === 'page') populatePageTargets(document.getElementById('f-page-target').value || null)
}

export function showSliderActionFields(type) { showActionFields('s', SLIDER_ACTION_TYPES, type) }
export function showKnobActionFields(type)   { showActionFields('k', SLIDER_ACTION_TYPES, type) }

export function showSwitchActionFields(type) {
  showActionFields('t', SWITCH_ACTION_TYPES, type)
  if (type === 'page') fillPageSelect('t-page-target', document.getElementById('t-page-target').value || null)
}

// ── Page select helpers ────────────────────────────────
export function fillPageSelect(selId, selectedId = null) {
  const sel = document.getElementById(selId)
  if (!sel) return
  sel.innerHTML = ''
  state.config.pages.forEach(p => {
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name
    if (p.id === selectedId) opt.selected = true
    sel.appendChild(opt)
  })
}

export function populatePageTargets(selectedId = null) { fillPageSelect('f-page-target', selectedId) }

// ── Folder sub-pages UI ────────────────────────────────
export function renderFolderPagesList(comp, pageIdx, compId) {
  const list = document.getElementById('folder-pages-list')
  list.innerHTML = ''
  const folderPages = comp?.pages || []
  if (!folderPages.length) {
    list.innerHTML = '<div class="field-hint folder-empty-hint">No sub-pages yet. Click "+ Add page" to create one.</div>'
    return
  }
  folderPages.forEach((fp, i) => {
    const row = document.createElement('div')
    row.className = 'folder-page-row'
    row.innerHTML = `
      <span class="folder-page-name">${fp.name}</span>
      <div class="folder-page-btns">
        <button class="btn-sm" data-rename="${i}">Rename</button>
        ${folderPages.length > 1 ? `<button class="btn-sm btn-sm-danger" data-del="${i}">✕</button>` : ''}
      </div>`
    row.querySelector(`[data-rename="${i}"]`)?.addEventListener('click', () => {
      const name = prompt('Page name:', fp.name)
      if (!name?.trim()) return
      const c = adminPages()[pageIdx].components.find(c => c.id === compId)
      if (c?.pages?.[i]) { c.pages[i].name = name.trim(); pushConfig(); renderFolderPagesList(c, pageIdx, compId) }
    })
    row.querySelector(`[data-del="${i}"]`)?.addEventListener('click', () => {
      if (!confirm(`Delete "${fp.name}"?`)) return
      const c = adminPages()[pageIdx].components.find(c => c.id === compId)
      if (c) { c.pages.splice(i, 1); pushConfig(); renderFolderPagesList(c, pageIdx, compId) }
    })
    list.appendChild(row)
  })
}

// ── Open modal ─────────────────────────────────────────
export function openModal(pageIdx, compId, col, row) {
  state.editingComp   = { pageIdx, compId, col: col || 1, row: row || 1 }
  state.pendingImages = {}
  const comp    = compId ? adminPages()[pageIdx].components.find(c => c.id === compId) : null

  document.getElementById('modal-title').textContent    = comp ? 'Edit' : 'Add'
  document.getElementById('modal-delete').style.display = comp ? 'block' : 'none'

  document.getElementById('f-col-span').value = comp?.colSpan || 1
  document.getElementById('f-row-span').value = comp?.rowSpan || 1

  const compType = comp?.componentType || 'button'
  setCompType(compType)
  const uiType = compType === 'toggle' ? 'switch' : compType

  setAppearanceFromComp(comp, uiType)

  if (uiType === 'button' || !uiType) {
    const at = comp?.action?.type || 'builtin'
    document.getElementById('f-action-type').value = at
    showButtonActionFields(at)

    const a = comp?.action
    if (a?.type === 'builtin')  document.getElementById('f-builtin-key').value = a.key || BUILTIN_ACTIONS[0].key
    if (a?.type === 'hotkey')   document.getElementById('f-hotkey').value       = a.combo || ''
    if (a?.type === 'command')  document.getElementById('f-command').value      = a.command || ''
    if (a?.type === 'sequence') {
      document.getElementById('f-sequence').value  = (a.commands || []).join('\n')
      document.getElementById('f-seq-delay').value = a.delay ?? 150
    }
    if (a?.type === 'page') populatePageTargets(a.pageId)
    if (a?.type === 'plugin') {
      document.getElementById('f-plugin-action').value = a.pluginKey || ''
      renderPluginParams(a.pluginKey || '', a.params || {})
    }

    const holdCmd = comp?.holdAction?.command || ''
    document.getElementById('f-hold-enable').checked     = !!holdCmd
    document.getElementById('hold-fields').style.display = holdCmd ? 'block' : 'none'
    document.getElementById('f-hold-command').value      = holdCmd
  }

  if (uiType === 'switch') {
    const rawAt = comp?.action?.type || 'command'
    const tAt = rawAt === 'toggle' ? 'command' : rawAt
    document.getElementById('t-action-type').value = tAt
    showSwitchActionFields(tAt)
    document.getElementById('t-off-cmd').value = comp?.action?.off || ''
    document.getElementById('t-on-cmd').value  = comp?.action?.on  || ''
    if (tAt === 'builtin')  document.getElementById('t-builtin-key').value = comp?.action?.key || BUILTIN_ACTIONS[0].key
    if (tAt === 'hotkey')   document.getElementById('t-hotkey').value       = comp?.action?.combo || ''
    if (tAt === 'sequence') {
      document.getElementById('t-sequence').value  = (comp?.action?.commands || []).join('\n')
      document.getElementById('t-seq-delay').value = comp?.action?.delay ?? 150
    }
    if (tAt === 'page') fillPageSelect('t-page-target', comp?.action?.pageId)
  }

  if (uiType === 'slider') {
    document.getElementById('s-min').value         = comp?.min          ?? 0
    document.getElementById('s-max').value         = comp?.max          ?? 100
    document.getElementById('s-step').value        = comp?.step         ?? 5
    document.getElementById('s-default').value     = comp?.defaultValue ?? 50
    document.getElementById('s-infinite').checked  = !!comp?.infiniteScroll
    const sAt = comp?.action?.type || 'volume'
    document.getElementById('s-action-type').value = sAt
    showSliderActionFields(sAt)
    document.getElementById('s-command').value = comp?.action?.command || ''
    if (sAt === 'scroll') {
      document.getElementById('s-scroll-dir').value   = comp?.action?.direction || 'vertical'
      document.getElementById('s-scroll-speed').value = comp?.action?.speed     || '2'
    }
    if (sAt === 'hotkey')   document.getElementById('s-hotkey').value       = comp?.action?.combo || ''
    if (sAt === 'sequence') {
      document.getElementById('s-sequence').value  = (comp?.action?.commands || []).join('\n')
      document.getElementById('s-seq-delay').value = comp?.action?.delay ?? 150
    }
  }

  if (uiType === 'knob') {
    document.getElementById('k-min').value        = comp?.min          ?? 0
    document.getElementById('k-max').value        = comp?.max          ?? 100
    document.getElementById('k-step').value       = comp?.step         ?? 1
    document.getElementById('k-default').value    = comp?.defaultValue ?? 50
    document.getElementById('k-infinite').checked = !!comp?.infiniteScroll
    const kAt = comp?.action?.type || 'volume'
    document.getElementById('k-action-type').value = kAt
    showKnobActionFields(kAt)
    document.getElementById('k-command').value = comp?.action?.command || ''
    if (kAt === 'scroll') {
      document.getElementById('k-scroll-dir').value   = comp?.action?.direction || 'vertical'
      document.getElementById('k-scroll-speed').value = comp?.action?.speed     || '2'
    }
    if (kAt === 'hotkey')   document.getElementById('k-hotkey').value       = comp?.action?.combo || ''
    if (kAt === 'sequence') {
      document.getElementById('k-sequence').value  = (comp?.action?.commands || []).join('\n')
      document.getElementById('k-seq-delay').value = comp?.action?.delay ?? 150
    }
  }

  if (uiType === 'tile') {
    document.getElementById('tile-command').value  = comp?.pollCommand  || ''
    document.getElementById('tile-interval').value = comp?.pollInterval ?? 5
    document.getElementById('tile-format').value   = comp?.tileFormat   || '{value}'
    document.getElementById('tile-tap-cmd').value  = comp?.tileTapCmd   || ''
  }

  if (uiType === 'voice') {
    document.getElementById('voice-mode').value    = comp?.voiceMode    || 'smart'
    document.getElementById('voice-command').value = comp?.voiceCommand || ''
    document.getElementById('voice-cmd-field').style.display = (comp?.voiceMode === 'template') ? '' : 'none'
  }

  if (uiType === 'plugin-tile') {
    document.getElementById('ptile-plugin-id').value = comp?.pluginTileId    || ''
    document.getElementById('ptile-event').value     = comp?.pluginTileEvent || ''
    document.getElementById('ptile-field').value     = comp?.pluginTileField || 'value'
  }

  if (uiType === 'folder') {
    renderFolderPagesList(comp, pageIdx, compId)
  }

  document.getElementById('drawer').classList.add('open')
}

// ── Close / save / delete modal ────────────────────────
export function closeModal() { document.getElementById('drawer').classList.remove('open'); state.editingComp = null }

export function saveModal() {
  const { pageIdx, compId, col, row } = state.editingComp
  const components = adminPages()[pageIdx].components
  const existing   = compId ? components.find(c => c.id === compId) : null

  const colSpan = Math.max(1, parseInt(document.getElementById('f-col-span').value) || 1)
  const rowSpan = Math.max(1, parseInt(document.getElementById('f-row-span').value) || 1)
  const ea      = getAppearanceFields(existing)
  let fields    = {}

  if (state.currentCompType === 'button') {
    const at = document.getElementById('f-action-type').value
    let action
    switch (at) {
      case 'builtin':  action = { type: 'builtin',  key:       document.getElementById('f-builtin-key').value }; break
      case 'hotkey':   action = { type: 'hotkey',   combo:     document.getElementById('f-hotkey').value.trim() }; break
      case 'command':  action = { type: 'command',  command:   document.getElementById('f-command').value.trim() }; break
      case 'sequence': action = { type: 'sequence', commands:  document.getElementById('f-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('f-seq-delay').value) || 150 }; break
      case 'page':     action = { type: 'page',     pageId:    document.getElementById('f-page-target').value }; break
      case 'plugin':   action = { type: 'plugin',   pluginKey: document.getElementById('f-plugin-action').value, params: collectPluginParams() }; break
    }
    const holdEnabled = document.getElementById('f-hold-enable').checked
    const holdCmd     = document.getElementById('f-hold-command').value.trim()
    fields = {
      componentType: 'button',
      icon:      ea.icon,
      label:     ea.label,
      color:     ea.color,
      image:     ea.image,
      action,
      holdAction: (holdEnabled && holdCmd) ? { type: 'command', command: holdCmd } : null
    }
  }

  if (state.currentCompType === 'switch' || state.currentCompType === 'toggle') {
    const tAt = document.getElementById('t-action-type').value
    let tAction
    switch (tAt) {
      case 'builtin':  tAction = { type: 'builtin',  key:      document.getElementById('t-builtin-key').value }; break
      case 'hotkey':   tAction = { type: 'hotkey',   combo:    document.getElementById('t-hotkey').value.trim() }; break
      case 'sequence': tAction = { type: 'sequence', commands: document.getElementById('t-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('t-seq-delay').value) || 150 }; break
      case 'page':     tAction = { type: 'page',     pageId:   document.getElementById('t-page-target').value }; break
      default:         tAction = { type: 'toggle',   on:       document.getElementById('t-on-cmd').value.trim(), off: document.getElementById('t-off-cmd').value.trim() }
    }
    fields = {
      componentType: 'switch',
      label:       ea.label,
      color:       ea.color,
      image:       ea.image,
      activeColor: document.getElementById('ea-active-color').value,
      action:      tAction
    }
  }

  if (state.currentCompType === 'slider') {
    const sAt = document.getElementById('s-action-type').value
    let sAction
    switch (sAt) {
      case 'volume':   sAction = { type: 'volume' }; break
      case 'scroll':   sAction = { type: 'scroll', direction: document.getElementById('s-scroll-dir').value, speed: parseInt(document.getElementById('s-scroll-speed').value) || 2 }; break
      case 'hotkey':   sAction = { type: 'hotkey',   combo:    document.getElementById('s-hotkey').value.trim() }; break
      case 'sequence': sAction = { type: 'sequence', commands: document.getElementById('s-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('s-seq-delay').value) || 150 }; break
      default:         sAction = { type: 'command',  command:  document.getElementById('s-command').value.trim() }
    }
    fields = {
      componentType:  'slider',
      label:          ea.label,
      color:          ea.color,
      image:          ea.image,
      orientation:    existing?.orientation || 'vertical',
      min:            parseFloat(document.getElementById('s-min').value)     || 0,
      max:            parseFloat(document.getElementById('s-max').value)     || 100,
      step:           parseFloat(document.getElementById('s-step').value)    || 5,
      defaultValue:   parseFloat(document.getElementById('s-default').value) || 50,
      infiniteScroll: document.getElementById('s-infinite').checked,
      action:         sAction
    }
  }

  if (state.currentCompType === 'knob') {
    const kAt = document.getElementById('k-action-type').value
    let kAction
    switch (kAt) {
      case 'volume':   kAction = { type: 'volume' }; break
      case 'scroll':   kAction = { type: 'scroll', direction: document.getElementById('k-scroll-dir').value, speed: parseInt(document.getElementById('k-scroll-speed').value) || 2 }; break
      case 'hotkey':   kAction = { type: 'hotkey',   combo:    document.getElementById('k-hotkey').value.trim() }; break
      case 'sequence': kAction = { type: 'sequence', commands: document.getElementById('k-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('k-seq-delay').value) || 150 }; break
      default:         kAction = { type: 'command',  command:  document.getElementById('k-command').value.trim() }
    }
    fields = {
      componentType:  'knob',
      label:          ea.label,
      color:          ea.color,
      image:          ea.image,
      min:            parseFloat(document.getElementById('k-min').value)     || 0,
      max:            parseFloat(document.getElementById('k-max').value)     || 100,
      step:           parseFloat(document.getElementById('k-step').value)    || 1,
      defaultValue:   parseFloat(document.getElementById('k-default').value) || 50,
      infiniteScroll: document.getElementById('k-infinite').checked,
      action:         kAction
    }
  }

  if (state.currentCompType === 'tile') {
    fields = {
      componentType: 'tile',
      label:        ea.label,
      color:        ea.color,
      image:        ea.image,
      pollCommand:  document.getElementById('tile-command').value.trim(),
      pollInterval: parseInt(document.getElementById('tile-interval').value) || 5,
      tileFormat:   document.getElementById('tile-format').value.trim() || '{value}',
      tileTapCmd:   document.getElementById('tile-tap-cmd').value.trim()
    }
  }

  if (state.currentCompType === 'spotify') {
    fields = {
      componentType: 'spotify',
      color:  ea.color,
      action: { type: 'builtin', key: 'media.playPause' }
    }
  }

  if (state.currentCompType === 'voice') {
    const mode = document.getElementById('voice-mode').value
    fields = {
      componentType: 'voice',
      icon:         ea.icon || '🎤',
      label:        ea.label || 'Voice',
      color:        ea.color,
      image:        ea.image,
      voiceMode:    mode,
      voiceCommand: document.getElementById('voice-command').value.trim()
    }
  }

  if (state.currentCompType === 'plugin-tile') {
    fields = {
      componentType:   'plugin-tile',
      label:           ea.label,
      color:           ea.color,
      image:           ea.image,
      pluginTileId:    document.getElementById('ptile-plugin-id').value.trim(),
      pluginTileEvent: document.getElementById('ptile-event').value.trim(),
      pluginTileField: document.getElementById('ptile-field').value.trim() || 'value'
    }
  }

  if (state.currentCompType === 'folder') {
    fields = {
      componentType: 'folder',
      icon:  ea.icon  || '📁',
      label: ea.label || 'Folder',
      color: ea.color,
      image: ea.image,
      pages: existing?.pages || []
    }
  }

  if (existing) {
    Object.assign(existing, fields, { colSpan, rowSpan })
  } else {
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    components.push({ id, col, row, colSpan, rowSpan, ...fields })
  }

  pushConfig(); renderGrid(); closeModal()
}

export function deleteComp() {
  const { pageIdx, compId } = state.editingComp
  const page = adminPages()[pageIdx]
  page.components = page.components.filter(c => c.id !== compId)
  pushConfig(); renderGrid(); closeModal()
}
