// Note: circular imports with grid.ts and plugins.ts are intentional —
// all cross-module calls happen inside function bodies, never at module init.
import type { Component, Action, ComponentType } from '../../shared/types'
import { state, adminPages } from './state'
import { BUILTIN_ACTIONS, SLIDER_ACTION_TYPES, SWITCH_ACTION_TYPES } from './constants'
import { renderPluginParams, collectPluginParams } from './plugins'
import { setAppearanceFromComp, getAppearanceFields } from './appearance'
import { pushConfig } from './config'
import { renderGrid } from './grid'

function el(id: string): HTMLElement          { return document.getElementById(id) as HTMLElement }
function inp(id: string): HTMLInputElement    { return document.getElementById(id) as HTMLInputElement }
function sel(id: string): HTMLSelectElement   { return document.getElementById(id) as HTMLSelectElement }
function chk(id: string): HTMLInputElement    { return document.getElementById(id) as HTMLInputElement }

// ── Component type tabs ────────────────────────────────
export function setCompType(type: string): void {
  state.currentCompType = type
  const uiType = type === 'toggle' ? 'switch' : type
  document.querySelectorAll<HTMLElement>('.type-tab').forEach(t => t.classList.toggle('active', t.dataset['type'] === uiType))
  for (const t of ['button', 'switch', 'slider', 'knob', 'spotify', 'tile', 'voice', 'plugin-tile', 'folder', 'counter', 'clock', 'stopwatch', 'countdown', 'trackpad']) {
    const tabEl = document.getElementById(`comp-${t}`)
    if (tabEl) tabEl.style.display = t === uiType ? 'block' : 'none'
  }
}

// ── Action field visibility ────────────────────────────
export function showActionFields(prefix: string, types: readonly string[], type: string): void {
  for (const t of types) {
    el(`${prefix}-action-${t}`).style.display = t === type ? '' : 'none'
  }
}

export function showButtonActionFields(type: string): void {
  for (const t of ['builtin', 'hotkey', 'command', 'sequence', 'page', 'plugin', 'webhook', 'conditional']) {
    el(`action-${t}`).style.display = t === type ? 'block' : 'none'
  }
  if (type === 'page') populatePageTargets(sel('f-page-target').value || null)
}

export function showSliderActionFields(type: string): void { showActionFields('s', SLIDER_ACTION_TYPES, type) }
export function showKnobActionFields(type: string): void   { showActionFields('k', SLIDER_ACTION_TYPES, type) }

export function showSwitchActionFields(type: string): void {
  showActionFields('t', SWITCH_ACTION_TYPES, type)
  if (type === 'page') fillPageSelect('t-page-target', sel('t-page-target').value || null)
}

// ── Page select helpers ────────────────────────────────
export function fillPageSelect(selId: string, selectedId: string | null = null): void {
  const selEl = document.getElementById(selId) as HTMLSelectElement | null
  if (!selEl) return
  selEl.innerHTML = ''
  state.config!.pages.forEach(p => {
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name
    if (p.id === selectedId) opt.selected = true
    selEl.appendChild(opt)
  })
}

export function populatePageTargets(selectedId: string | null = null): void { fillPageSelect('f-page-target', selectedId) }

// ── Folder sub-pages UI ────────────────────────────────
export function renderFolderPagesList(comp: Component | null, pageIdx: number, compId: string): void {
  const list = el('folder-pages-list')
  list.innerHTML = ''
  const folderPages = comp?.pages ?? []
  if (!folderPages.length) {
    list.innerHTML = '<div class="field-hint folder-empty-hint">No sub-pages yet. Click "+ Add page" to create one.</div>'
    return
  }
  folderPages.forEach((fp, i) => {
    const row = document.createElement('div')
    row.className = 'folder-page-row'

    const nameSpan = document.createElement('span')
    nameSpan.className   = 'folder-page-name'
    nameSpan.textContent = fp.name

    const btnsDiv   = document.createElement('div')
    btnsDiv.className = 'folder-page-btns'

    const renameBtn = document.createElement('button')
    renameBtn.className       = 'btn-sm'
    renameBtn.dataset['rename'] = String(i)
    renameBtn.textContent     = 'Rename'
    btnsDiv.appendChild(renameBtn)

    if (folderPages.length > 1) {
      const delBtn = document.createElement('button')
      delBtn.className     = 'btn-sm btn-sm-danger'
      delBtn.dataset['del'] = String(i)
      delBtn.textContent   = '✕'
      btnsDiv.appendChild(delBtn)
    }

    row.appendChild(nameSpan)
    row.appendChild(btnsDiv)

    row.querySelector<HTMLElement>(`[data-rename="${i}"]`)?.addEventListener('click', () => {
      const name = prompt('Page name:', fp.name)
      if (!name?.trim()) return
      const c = adminPages()[pageIdx].components.find(cx => cx.id === compId)
      if (c?.pages?.[i]) { c.pages[i].name = name.trim(); pushConfig(); renderFolderPagesList(c, pageIdx, compId) }
    })
    row.querySelector<HTMLElement>(`[data-del="${i}"]`)?.addEventListener('click', () => {
      if (!confirm(`Delete "${fp.name}"?`)) return
      const c = adminPages()[pageIdx].components.find(cx => cx.id === compId)
      if (c) { c.pages?.splice(i, 1); pushConfig(); renderFolderPagesList(c, pageIdx, compId) }
    })
    list.appendChild(row)
  })
}

// ── Open modal ─────────────────────────────────────────
export function openModal(pageIdx: number, compId: string | null, col?: number, row?: number): void {
  state.editingComp   = { pageIdx, compId: compId ?? '', col: col ?? 1, row: row ?? 1 }
  state.pendingImages = {}
  const comp: Partial<Component> | null = compId ? adminPages()[pageIdx].components.find(c => c.id === compId) ?? null : null

  el('modal-title').textContent    = comp ? 'Edit' : 'Add'
  el('modal-delete').style.display = comp ? 'block' : 'none'

  inp('f-col-span').value = String(comp?.colSpan ?? 1)
  inp('f-row-span').value = String(comp?.rowSpan ?? 1)

  const compType = (comp?.componentType ?? 'button') as ComponentType
  setCompType(compType)
  const uiType = compType === 'toggle' ? 'switch' : compType

  setAppearanceFromComp(comp, uiType)

  if (uiType === 'button') {
    const at = comp?.action?.type || 'builtin'
    sel('f-action-type').value = at
    showButtonActionFields(at)

    const a = comp?.action
    if (a?.type === 'builtin')  sel('f-builtin-key').value    = a.key || BUILTIN_ACTIONS[0].key
    if (a?.type === 'hotkey')   inp('f-hotkey').value          = a.combo || ''
    if (a?.type === 'command')  inp('f-command').value         = a.command || ''
    if (a?.type === 'sequence') {
      inp('f-sequence').value  = (a.commands || []).join('\n')
      inp('f-seq-delay').value = String(a.delay ?? 150)
    }
    if (a?.type === 'page') populatePageTargets(a.pageId ?? null)
    if (a?.type === 'plugin') {
      sel('f-plugin-action').value = a.pluginKey || ''
      renderPluginParams(a.pluginKey || '', a.params || {})
    }
    if (a?.type === 'webhook') {
      inp('f-webhook-url').value    = a.url || ''
      sel('f-webhook-method').value = a.method || 'POST'
      inp('f-webhook-body').value   = a.body || ''
      inp('f-webhook-headers').value = a.headers
        ? Object.entries(a.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
        : ''
    }
    if (a?.type === 'conditional') {
      sel('f-cond-condition').value = a.condition || 'toggle'
      inp('f-cond-key').value       = a.key || ''
      inp('f-cond-value').value     = a.value || ''
      const thenType = a.then?.type || 'command'
      sel('f-cond-then-type').value = thenType
      inp('f-cond-then-cmd').value  = thenType === 'command' ? (a.then?.type === 'command' ? a.then.command : '')
        : thenType === 'hotkey' ? (a.then?.type === 'hotkey' ? a.then.combo : '')
        : thenType === 'builtin' ? (a.then?.type === 'builtin' ? a.then.key : '')
        : ''
      const elseAction = a.else
      const elseType   = elseAction?.type || ''
      sel('f-cond-else-type').value = elseType
      inp('f-cond-else-cmd').value  = elseType === 'command' ? (elseAction?.type === 'command' ? elseAction.command : '')
        : elseType === 'hotkey' ? (elseAction?.type === 'hotkey' ? elseAction.combo : '')
        : elseType === 'builtin' ? (elseAction?.type === 'builtin' ? elseAction.key : '')
        : ''
    }

    const holdAction = comp?.holdAction
    const holdCmd = (holdAction?.type === 'command' ? holdAction.command : '') || ''
    chk('f-hold-enable').checked             = !!holdCmd
    el('hold-fields').style.display          = holdCmd ? 'block' : 'none'
    inp('f-hold-command').value              = holdCmd
  }

  if (uiType === 'switch') {
    const rawAt = comp?.action?.type || 'command'
    const tAt = rawAt === 'toggle' ? 'command' : rawAt
    sel('t-action-type').value = tAt
    showSwitchActionFields(tAt)
    const ta = comp?.action
    inp('t-off-cmd').value = (ta?.type === 'toggle' ? ta.off : '') || ''
    inp('t-on-cmd').value  = (ta?.type === 'toggle' ? ta.on  : '') || ''
    if (tAt === 'builtin')  sel('t-builtin-key').value = (ta?.type === 'builtin'  ? ta.key      : '') || BUILTIN_ACTIONS[0].key
    if (tAt === 'hotkey')   inp('t-hotkey').value       = (ta?.type === 'hotkey'   ? ta.combo    : '') || ''
    if (tAt === 'sequence') {
      inp('t-sequence').value  = ((ta?.type === 'sequence' ? ta.commands : []) || []).join('\n')
      inp('t-seq-delay').value = String(ta?.type === 'sequence' ? (ta.delay ?? 150) : 150)
    }
    if (tAt === 'page') fillPageSelect('t-page-target', (ta?.type === 'page' ? ta.pageId : null) ?? null)
  }

  if (uiType === 'slider') {
    inp('s-min').value          = String(comp?.min          ?? 0)
    inp('s-max').value          = String(comp?.max          ?? 100)
    inp('s-step').value         = String(comp?.step         ?? 5)
    inp('s-default').value      = String(comp?.defaultValue ?? 50)
    chk('s-infinite').checked   = !!comp?.infiniteScroll
    const sa = comp?.action
    const sAt = sa?.type || 'volume'
    sel('s-action-type').value  = sAt
    showSliderActionFields(sAt)
    inp('s-command').value      = (sa?.type === 'command' ? sa.command : '') || ''
    if (sAt === 'scroll') {
      sel('s-scroll-dir').value   = (sa?.type === 'scroll' ? sa.direction : '') || 'vertical'
      inp('s-scroll-speed').value = String(sa?.type === 'scroll' ? (sa.speed ?? 2) : 2)
    }
    if (sAt === 'hotkey')   inp('s-hotkey').value       = (sa?.type === 'hotkey'   ? sa.combo    : '') || ''
    if (sAt === 'sequence') {
      inp('s-sequence').value  = ((sa?.type === 'sequence' ? sa.commands : []) || []).join('\n')
      inp('s-seq-delay').value = String(sa?.type === 'sequence' ? (sa.delay ?? 150) : 150)
    }
  }

  if (uiType === 'knob') {
    inp('k-min').value         = String(comp?.min          ?? 0)
    inp('k-max').value         = String(comp?.max          ?? 100)
    inp('k-step').value        = String(comp?.step         ?? 1)
    inp('k-default').value     = String(comp?.defaultValue ?? 50)
    chk('k-infinite').checked  = !!comp?.infiniteScroll
    const ka = comp?.action
    const kAt = ka?.type || 'volume'
    sel('k-action-type').value = kAt
    showKnobActionFields(kAt)
    inp('k-command').value     = (ka?.type === 'command' ? ka.command : '') || ''
    if (kAt === 'scroll') {
      sel('k-scroll-dir').value   = (ka?.type === 'scroll' ? ka.direction : '') || 'vertical'
      inp('k-scroll-speed').value = String(ka?.type === 'scroll' ? (ka.speed ?? 2) : 2)
    }
    if (kAt === 'hotkey')   inp('k-hotkey').value       = (ka?.type === 'hotkey'   ? ka.combo    : '') || ''
    if (kAt === 'sequence') {
      inp('k-sequence').value  = ((ka?.type === 'sequence' ? ka.commands : []) || []).join('\n')
      inp('k-seq-delay').value = String(ka?.type === 'sequence' ? (ka.delay ?? 150) : 150)
    }
  }

  if (uiType === 'tile') {
    inp('tile-command').value  = comp?.pollCommand  || ''
    inp('tile-interval').value = String(comp?.pollInterval ?? 5)
    inp('tile-format').value   = comp?.tileFormat   || '{value}'
    inp('tile-tap-cmd').value  = comp?.tileTapCmd   || ''
  }

  if (uiType === 'voice') {
    // Drawer opens immediately; voice fields are populated once Pro status is confirmed
    el('drawer').classList.add('open')
    window.api.getLicenseStatus().then(status => {
      const voiceFields = el('comp-voice')
      if (!status.isPro) {
        voiceFields.innerHTML = ''
        const msg = document.createElement('div')
        msg.className = 'field-hint'
        msg.style.padding = '14px 0'
        msg.textContent = 'AI Voice requires MacroPad Pro. Activate your license key in the sidebar to unlock this feature.'
        voiceFields.appendChild(msg)
      } else {
        sel('voice-mode').value    = comp?.voiceMode    || 'smart'
        inp('voice-command').value = comp?.voiceCommand || ''
        el('voice-cmd-field').style.display = (comp?.voiceMode === 'template') ? '' : 'none'
      }
    }).catch(() => { /* voice fields stay in default HTML state on error */ })
    return
  }

  if (uiType === 'plugin-tile') {
    inp('ptile-plugin-id').value = comp?.pluginTileId    || ''
    inp('ptile-event').value     = comp?.pluginTileEvent || ''
    inp('ptile-field').value     = comp?.pluginTileField || 'value'
  }

  if (uiType === 'folder') {
    renderFolderPagesList(comp as Component | null, pageIdx, compId ?? '')
  }

  if (uiType === 'counter') {
    inp('ctr-min').value  = String(comp?.counterMin  ?? 0)
    inp('ctr-max').value  = comp?.counterMax !== null && comp?.counterMax !== undefined ? String(comp.counterMax) : ''
    inp('ctr-step').value = String(comp?.counterStep ?? 1)
  }

  if (uiType === 'clock') {
    inp('clk-format').value       = comp?.clockFormat      || 'HH:mm'
    chk('clk-show-date').checked  = !!comp?.clockShowDate
    inp('clk-date-format').value  = comp?.clockDateFormat  || ''
    inp('clk-timezone').value     = comp?.clockTimezone    || ''
  }

  if (uiType === 'stopwatch') {
    chk('sw-show-ms').checked = !!comp?.stopwatchShowMs
  }

  if (uiType === 'countdown') {
    inp('cd-duration').value    = String(comp?.duration ?? 60)
    const oc = comp?.onComplete
    inp('cd-on-complete').value = (oc?.type === 'command' ? oc.command : '') || ''
  }

  if (uiType === 'trackpad') {
    inp('tp-sensitivity').value         = String(comp?.trackpadSensitivity    ?? 1.0)
    chk('tp-natural-scroll').checked    = !!comp?.trackpadNaturalScroll
  }

  el('drawer').classList.add('open')
}

// ── Close / save / delete modal ────────────────────────
export function closeModal(): void { el('drawer').classList.remove('open'); state.editingComp = null }

export function saveModal(): void {
  const { pageIdx, compId, col, row } = state.editingComp!
  const components = adminPages()[pageIdx].components
  const existing: Component | null = compId ? components.find(c => c.id === compId) ?? null : null

  const colSpan = Math.max(1, parseInt(inp('f-col-span').value) || 1)
  const rowSpan = Math.max(1, parseInt(inp('f-row-span').value) || 1)
  const ea      = getAppearanceFields(existing)
  let fields: Partial<Component> = {}

  if (state.currentCompType === 'button') {
    const at = sel('f-action-type').value
    let action: Action = { type: 'builtin', key: BUILTIN_ACTIONS[0].key }
    switch (at) {
      case 'builtin':  action = { type: 'builtin',  key:       sel('f-builtin-key').value }; break
      case 'hotkey':   action = { type: 'hotkey',   combo:     inp('f-hotkey').value.trim() }; break
      case 'command':  action = { type: 'command',  command:   inp('f-command').value.trim() }; break
      case 'sequence': action = { type: 'sequence', commands:  inp('f-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(inp('f-seq-delay').value) || 150 }; break
      case 'page':     action = { type: 'page',     pageId:    sel('f-page-target').value }; break
      case 'plugin':   action = { type: 'plugin',   pluginKey: sel('f-plugin-action').value, params: collectPluginParams() }; break
      case 'webhook': {
        const rawHeaders = inp('f-webhook-headers').value.trim()
        const headers: Record<string, string> = {}
        if (rawHeaders) {
          for (const line of rawHeaders.split('\n')) {
            const colon = line.indexOf(':')
            if (colon > 0) {
              const hKey = line.slice(0, colon).trim()
              const hVal = line.slice(colon + 1).trim()
              if (hKey) headers[hKey] = hVal
            }
          }
        }
        const method = sel('f-webhook-method').value as 'GET' | 'POST' | 'PUT' | 'DELETE'
        action = {
          type:    'webhook',
          url:     inp('f-webhook-url').value.trim(),
          method,
          body:    inp('f-webhook-body').value,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }
        break
      }
      case 'conditional': {
        const condition  = sel('f-cond-condition').value as 'toggle' | 'tile'
        const condKey    = inp('f-cond-key').value.trim()
        const condValue  = inp('f-cond-value').value.trim()
        const thenType   = sel('f-cond-then-type').value
        const thenCmd    = inp('f-cond-then-cmd').value.trim()
        const elseType   = sel('f-cond-else-type').value
        const elseCmd    = inp('f-cond-else-cmd').value.trim()
        const thenAction: Action =
          thenType === 'hotkey'  ? { type: 'hotkey',  combo:   thenCmd } :
          thenType === 'builtin' ? { type: 'builtin', key:     thenCmd } :
                                   { type: 'command', command: thenCmd }
        const elseAction: Action | undefined =
          elseType === 'command' ? { type: 'command', command: elseCmd } :
          elseType === 'hotkey'  ? { type: 'hotkey',  combo:   elseCmd } :
          elseType === 'builtin' ? { type: 'builtin', key:     elseCmd } :
          undefined
        action = {
          type:      'conditional',
          condition,
          key:       condKey,
          value:     condValue || undefined,
          then:      thenAction,
          else:      elseAction,
        }
        break
      }
    }
    const holdEnabled = chk('f-hold-enable').checked
    const holdCmd     = inp('f-hold-command').value.trim()
    fields = {
      componentType: 'button',
      icon:      ea.icon,
      label:     ea.label,
      color:     ea.color,
      image:     ea.image,
      action,
      holdAction: (holdEnabled && holdCmd) ? { type: 'command', command: holdCmd } : null,
    }
  }

  if (state.currentCompType === 'switch' || state.currentCompType === 'toggle') {
    const tAt = sel('t-action-type').value
    let tAction: Action = { type: 'toggle', on: '', off: '' }
    switch (tAt) {
      case 'builtin':  tAction = { type: 'builtin',  key:      sel('t-builtin-key').value }; break
      case 'hotkey':   tAction = { type: 'hotkey',   combo:    inp('t-hotkey').value.trim() }; break
      case 'sequence': tAction = { type: 'sequence', commands: inp('t-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(inp('t-seq-delay').value) || 150 }; break
      case 'page':     tAction = { type: 'page',     pageId:   sel('t-page-target').value }; break
      default:         tAction = { type: 'toggle',   on:       inp('t-on-cmd').value.trim(), off: inp('t-off-cmd').value.trim() }
    }
    fields = {
      componentType: 'switch',
      label:       ea.label,
      color:       ea.color,
      image:       ea.image,
      activeColor: inp('ea-active-color').value,
      action:      tAction,
    }
  }

  if (state.currentCompType === 'slider') {
    const sAt = sel('s-action-type').value
    let sAction: Action = { type: 'volume' }
    switch (sAt) {
      case 'volume':   sAction = { type: 'volume' }; break
      case 'scroll':   sAction = { type: 'scroll',   direction: sel('s-scroll-dir').value, speed: parseInt(inp('s-scroll-speed').value) || 2 }; break
      case 'hotkey':   sAction = { type: 'hotkey',   combo:     inp('s-hotkey').value.trim() }; break
      case 'sequence': sAction = { type: 'sequence', commands:  inp('s-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(inp('s-seq-delay').value) || 150 }; break
      default:         sAction = { type: 'command',  command:   inp('s-command').value.trim() }
    }
    fields = {
      componentType:  'slider',
      label:          ea.label,
      color:          ea.color,
      image:          ea.image,
      orientation:    existing?.orientation || 'vertical',
      min:            parseFloat(inp('s-min').value)     || 0,
      max:            parseFloat(inp('s-max').value)     || 100,
      step:           parseFloat(inp('s-step').value)    || 5,
      defaultValue:   parseFloat(inp('s-default').value) || 50,
      infiniteScroll: chk('s-infinite').checked,
      action:         sAction,
    }
  }

  if (state.currentCompType === 'knob') {
    const kAt = sel('k-action-type').value
    let kAction: Action = { type: 'volume' }
    switch (kAt) {
      case 'volume':   kAction = { type: 'volume' }; break
      case 'scroll':   kAction = { type: 'scroll',   direction: sel('k-scroll-dir').value, speed: parseInt(inp('k-scroll-speed').value) || 2 }; break
      case 'hotkey':   kAction = { type: 'hotkey',   combo:     inp('k-hotkey').value.trim() }; break
      case 'sequence': kAction = { type: 'sequence', commands:  inp('k-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(inp('k-seq-delay').value) || 150 }; break
      default:         kAction = { type: 'command',  command:   inp('k-command').value.trim() }
    }
    fields = {
      componentType:  'knob',
      label:          ea.label,
      color:          ea.color,
      image:          ea.image,
      min:            parseFloat(inp('k-min').value)     || 0,
      max:            parseFloat(inp('k-max').value)     || 100,
      step:           parseFloat(inp('k-step').value)    || 1,
      defaultValue:   parseFloat(inp('k-default').value) || 50,
      infiniteScroll: chk('k-infinite').checked,
      action:         kAction,
    }
  }

  if (state.currentCompType === 'tile') {
    fields = {
      componentType: 'tile',
      label:        ea.label,
      color:        ea.color,
      image:        ea.image,
      pollCommand:  inp('tile-command').value.trim(),
      pollInterval: parseInt(inp('tile-interval').value) || 5,
      tileFormat:   inp('tile-format').value.trim() || '{value}',
      tileTapCmd:   inp('tile-tap-cmd').value.trim(),
    }
  }

  if (state.currentCompType === 'spotify') {
    fields = {
      componentType: 'spotify',
      color:  ea.color,
      action: { type: 'builtin', key: 'media.playPause' },
    }
  }

  if (state.currentCompType === 'voice') {
    const mode = sel('voice-mode').value
    fields = {
      componentType: 'voice',
      icon:         ea.icon || '🎤',
      label:        ea.label || 'Voice',
      color:        ea.color,
      image:        ea.image,
      voiceMode:    mode,
      voiceCommand: inp('voice-command').value.trim(),
    }
  }

  if (state.currentCompType === 'plugin-tile') {
    fields = {
      componentType:   'plugin-tile',
      label:           ea.label,
      color:           ea.color,
      image:           ea.image,
      pluginTileId:    inp('ptile-plugin-id').value.trim(),
      pluginTileEvent: inp('ptile-event').value.trim(),
      pluginTileField: inp('ptile-field').value.trim() || 'value',
    }
  }

  if (state.currentCompType === 'folder') {
    fields = {
      componentType: 'folder',
      icon:  ea.icon  || '📁',
      label: ea.label || 'Folder',
      color: ea.color,
      image: ea.image,
      pages: existing?.pages || [],
    }
  }

  if (state.currentCompType === 'counter') {
    const maxRaw = inp('ctr-max').value.trim()
    fields = {
      componentType: 'counter',
      label:       ea.label,
      color:       ea.color,
      image:       ea.image,
      counterMin:  parseFloat(inp('ctr-min').value)  || 0,
      counterMax:  maxRaw !== '' ? parseFloat(maxRaw) : null,
      counterStep: parseFloat(inp('ctr-step').value) || 1,
    }
  }

  if (state.currentCompType === 'clock') {
    fields = {
      componentType:  'clock',
      label:          ea.label,
      color:          ea.color,
      image:          ea.image,
      clockFormat:    inp('clk-format').value.trim()      || 'HH:mm',
      clockShowDate:  chk('clk-show-date').checked,
      clockDateFormat: inp('clk-date-format').value.trim() || undefined,
      clockTimezone:  inp('clk-timezone').value.trim()    || undefined,
    }
  }

  if (state.currentCompType === 'stopwatch') {
    fields = {
      componentType:    'stopwatch',
      label:            ea.label,
      color:            ea.color,
      image:            ea.image,
      stopwatchShowMs:  chk('sw-show-ms').checked,
    }
  }

  if (state.currentCompType === 'countdown') {
    const onCompleteCmd = inp('cd-on-complete').value.trim()
    fields = {
      componentType: 'countdown',
      label:         ea.label,
      color:         ea.color,
      image:         ea.image,
      duration:      parseInt(inp('cd-duration').value) || 60,
      onComplete:    onCompleteCmd ? { type: 'command' as const, command: onCompleteCmd } : null,
    }
  }

  if (state.currentCompType === 'trackpad') {
    fields = {
      componentType:          'trackpad',
      label:                  ea.label,
      color:                  ea.color,
      image:                  ea.image,
      trackpadSensitivity:    parseFloat(inp('tp-sensitivity').value) || 1.0,
      trackpadNaturalScroll:  chk('tp-natural-scroll').checked,
    }
  }

  if (existing) {
    Object.assign(existing, fields, { colSpan, rowSpan })
  } else {
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    components.push({ id, col, row, colSpan, rowSpan, ...fields } as Component)
  }

  pushConfig(); renderGrid(); closeModal()
}

export function deleteComp(): void {
  const { pageIdx, compId } = state.editingComp!
  const page = adminPages()[pageIdx]
  page.components = page.components.filter(c => c.id !== compId)
  pushConfig(); renderGrid(); closeModal()
}
