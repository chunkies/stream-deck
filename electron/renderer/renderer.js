'use strict'

const BUILTIN_ACTIONS = [
  { group: 'Media',  key: 'media.playPause',   label: '⏯  Play / Pause'   },
  { group: 'Media',  key: 'media.next',         label: '⏭  Next Track'     },
  { group: 'Media',  key: 'media.previous',     label: '⏮  Previous Track' },
  { group: 'Media',  key: 'media.volumeUp',     label: '🔊  Volume Up'      },
  { group: 'Media',  key: 'media.volumeDown',   label: '🔉  Volume Down'    },
  { group: 'Media',  key: 'media.mute',         label: '🔇  Mute Audio'     },
  { group: 'System', key: 'system.lock',        label: '🔒  Lock Screen'    },
  { group: 'System', key: 'system.sleep',       label: '💤  Sleep'          },
  { group: 'System', key: 'system.screenshot',  label: '📷  Screenshot'     },
]


let config          = null
let serverInfo      = null
let currentPageIdx  = 0
let editingComp     = null
let currentCompType = 'button'
let pendingImages   = {}
let adminFolderStack = []  // [{folderComp, pageIdx}] — folder navigation breadcrumb

function adminPages()    { return adminFolderStack.length ? adminFolderStack[adminFolderStack.length - 1].folderComp.pages : config.pages }
function adminIdx()      { return adminFolderStack.length ? adminFolderStack[adminFolderStack.length - 1].pageIdx : currentPageIdx }
function setAdminIdx(i)  { if (adminFolderStack.length) adminFolderStack[adminFolderStack.length - 1].pageIdx = i; else currentPageIdx = i }

function enterFolderAdmin(folderComp) {
  if (!folderComp.pages?.length) { alert('Add at least one sub-page first.'); return }
  adminFolderStack.push({ folderComp, pageIdx: 0 })
  closeModal()
  renderAll()
}

function exitFolderAdmin() {
  adminFolderStack.pop()
  renderAll()
}

// ── Server info display ───────────────────────────────
function applyServerInfo(info) {
  document.getElementById('server-url').textContent = info.url
  document.getElementById('server-url').href        = info.url
  const certRow  = document.getElementById('cert-row')
  const certHint = document.getElementById('cert-hint')
  if (info.mode === 'traefik') {
    if (certRow)  certRow.style.display  = 'none'
    if (certHint) certHint.textContent   = 'Trusted cert via traefik.me — just scan and go'
  } else {
    if (certRow)  certRow.style.display  = ''
    document.getElementById('cert-url').href = `${info.url}/cert.crt`
  }
  const qr = document.getElementById('qr-img')
  if (info.qr) { qr.src = info.qr; qr.style.display = 'block' }
}

// ── Init ──────────────────────────────────────────────
async function init() {
  ;[config, serverInfo] = await Promise.all([
    window.api.getConfig(),
    window.api.getServerInfo()
  ])

  populateBuiltinSelect()
  wireImageUploads()
  wirePluginReload()
  initAppearanceEditor()
  await loadAndPopulatePlugins()
  renderAll()


  // Load autostart
  const autostart = await window.api.getAutostart()
  document.getElementById('autostart-toggle').checked = autostart

  // Grid settings
  document.getElementById('grid-cols').value = config.grid.cols
  document.getElementById('grid-rows').value = config.grid.rows

  if (serverInfo?.url) applyServerInfo(serverInfo)

  window.api.onServerReady((info) => {
    serverInfo = info
    applyServerInfo(info)
    renderGrid()
  })

  window.api.onDeckEvent((event) => {
    if (event.type === 'connection') {
      const el = document.getElementById('phone-status')
      el.textContent = event.connected ? `Connected (${event.clients})` : 'Disconnected'
      el.className   = 'badge ' + (event.connected ? 'connected' : 'disconnected')
    }
    if (event.type === 'press' || event.type === 'slide') {
      const page = config?.pages.find(p => p.id === event.pageId)
      const comp = page?.components?.find(c => c.id === event.compId)
      if (comp) {
        const val = event.type === 'slide' ? ` → ${Math.round(event.value)}` : ''
        document.getElementById('last-press').textContent = `${comp.icon || comp.label || '?'}${val}`
      }
    }
  })
}

function populateBuiltinSelect() {
  for (const selId of ['f-builtin-key', 't-builtin-key', 's-builtin-key', 'k-builtin-key']) {
    const sel = document.getElementById(selId)
    if (!sel) continue
    sel.innerHTML = ''
    let lastGroup = ''
    for (const { group, key, label } of BUILTIN_ACTIONS) {
      if (group !== lastGroup) {
        const og = document.createElement('optgroup'); og.label = group; sel.appendChild(og)
        lastGroup = group
      }
      const opt = document.createElement('option'); opt.value = key; opt.textContent = label; sel.appendChild(opt)
    }
  }
}

// ── Image uploads ─────────────────────────────────────
function wireImageUploads() {
  const pairs = [
    { btn: 't-img-upload-btn',        clear: 't-img-clear-btn',        input: 't-img-file-input',        preview: 't-img-preview',        field: 'image'       },
    { btn: 't-active-img-upload-btn', clear: 't-active-img-clear-btn', input: 't-active-img-file-input', preview: 't-active-img-preview', field: 'activeImage' },
  ]
  for (const { btn, clear, input, preview, field } of pairs) {
    document.getElementById(btn).addEventListener('click', () => document.getElementById(input).click())
    document.getElementById(input).addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const url = await window.api.uploadMedia(file.path)
      pendingImages[field] = url
      showImagePreview(preview, clear, url)
    })
    document.getElementById(clear).addEventListener('click', () => {
      pendingImages[field] = null
      hideImagePreview(preview, clear)
      document.getElementById(input).value = ''
    })
  }
}

function showImagePreview(previewId, clearId, url) {
  if (!serverInfo) return
  const el = document.getElementById(previewId)
  el.style.backgroundImage = `url(https://${serverInfo.ip}:${serverInfo.port}${url})`
  el.style.display = 'block'
  document.getElementById(clearId).style.display = 'inline-block'
}

function hideImagePreview(previewId, clearId) {
  document.getElementById(previewId).style.display = 'none'
  document.getElementById(clearId).style.display = 'none'
}

function setImageField(previewId, clearId, url) {
  if (url && serverInfo) showImagePreview(previewId, clearId, url)
  else hideImagePreview(previewId, clearId)
}

// ── Plugin support ────────────────────────────────────
let loadedPlugins = []

async function loadAndPopulatePlugins() {
  const plugins = await window.api.getPlugins()
  populatePluginSelect(plugins)
}

const COMP_TYPE_LABELS = { button: 'btn', switch: 'sw', slider: 'slider', knob: 'knob', folder: 'folder' }

function populatePluginSelect(plugins) {
  loadedPlugins = plugins || []
  const sel = document.getElementById('f-plugin-action')
  sel.innerHTML = ''
  if (!loadedPlugins.length) {
    sel.innerHTML = '<option value="">— no plugins installed —</option>'
    renderPluginParams('', {})
    renderComponentPanel()
    return
  }
  for (const plugin of loadedPlugins) {
    const og = document.createElement('optgroup')
    og.label = plugin.name
    for (const action of plugin.actions) {
      const ct   = action.componentType
      const tag  = ct && COMP_TYPE_LABELS[ct] ? ` [${COMP_TYPE_LABELS[ct]}]` : ''
      const opt  = document.createElement('option')
      opt.value = action.key
      opt.textContent = action.label + tag
      og.appendChild(opt)
    }
    sel.appendChild(og)
  }
  renderPluginParams(sel.value, {})
  renderComponentPanel()
}


function getPluginActionByKey(key) {
  return loadedPlugins.flatMap(p => p.actions || []).find(a => a.key === key) || null
}

function renderPluginParams(actionKey, existingParams) {
  const container = document.getElementById('plugin-params')
  if (!container) return
  container.innerHTML = ''

  const action = loadedPlugins.flatMap(p => p.actions || []).find(a => a.key === actionKey)
  if (!action?.params?.length) return

  for (const param of action.params) {
    const row = document.createElement('div')
    row.className = 'field-row'

    const label = document.createElement('label')
    label.textContent = param.label

    let input
    if (param.type === 'textarea') {
      input = document.createElement('textarea')
      input.rows = 3
    } else {
      input = document.createElement('input')
      input.type = param.type === 'number' ? 'number' : 'text'
    }
    input.id          = `pp-${param.key}`
    input.className   = 'plugin-param-input'
    input.dataset.key = param.key
    input.dataset.typ = param.type || 'text'
    const existing = existingParams?.[param.key]
    input.value = existing !== undefined ? existing : (param.default ?? '')
    if (param.placeholder) input.placeholder = param.placeholder

    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

function collectPluginParams() {
  const params = {}
  document.querySelectorAll('.plugin-param-input').forEach(el => {
    params[el.dataset.key] = el.dataset.typ === 'number'
      ? (parseFloat(el.value) || 0)
      : el.value
  })
  return params
}

const SLIDER_ACTION_TYPES = ['volume', 'scroll', 'hotkey', 'command', 'sequence']
const SWITCH_ACTION_TYPES = ['builtin', 'hotkey', 'command', 'sequence', 'page']

function showActionFields(prefix, types, type) {
  for (const t of types) {
    document.getElementById(`${prefix}-action-${t}`).style.display = t === type ? '' : 'none'
  }
}
function showSliderActionFields(type) { showActionFields('s', SLIDER_ACTION_TYPES, type) }
function showKnobActionFields(type)   { showActionFields('k', SLIDER_ACTION_TYPES, type) }
function showSwitchActionFields(type) {
  showActionFields('t', SWITCH_ACTION_TYPES, type)
  if (type === 'page') fillPageSelect('t-page-target', document.getElementById('t-page-target').value || null)
}

function renderCompPluginParams(containerIdPrefix, actionKey, existingParams) {
  const container = document.getElementById(`${containerIdPrefix}-plugin-params`)
  if (!container) return
  container.innerHTML = ''
  const action = getPluginActionByKey(actionKey)
  if (!action?.params?.length) return
  for (const param of action.params) {
    const row   = document.createElement('div')
    row.className = 'field-row'
    const label = document.createElement('label')
    label.textContent = param.label
    const input = document.createElement('input')
    input.type        = param.type === 'number' ? 'number' : 'text'
    input.id          = `${containerIdPrefix}pp-${param.key}`
    input.className   = 'plugin-param-input'
    input.dataset.key = param.key
    input.dataset.typ = param.type || 'text'
    input.dataset.pfx = containerIdPrefix
    input.value       = existingParams?.[param.key] ?? (param.default ?? '')
    if (param.placeholder) input.placeholder = param.placeholder
    row.appendChild(label)
    row.appendChild(input)
    container.appendChild(row)
  }
}

function collectCompPluginParams(containerIdPrefix) {
  const params = {}
  document.querySelectorAll(`.plugin-param-input[data-pfx="${containerIdPrefix}"]`).forEach(el => {
    params[el.dataset.key] = el.dataset.typ === 'number' ? (parseFloat(el.value) || 0) : el.value
  })
  return params
}

function wirePluginReload() {
  document.getElementById('plugin-reload-btn').addEventListener('click', async () => {
    const plugins = await window.api.reloadPlugins()
    populatePluginSelect(plugins)
  })

  document.getElementById('f-plugin-action').addEventListener('change', (e) => {
    renderPluginParams(e.target.value, {})
    const action = getPluginActionByKey(e.target.value)
    const hint   = document.getElementById('plugin-comp-hint')
    if (action?.componentType && action.componentType !== 'button') {
      const label = { switch: 'Switch', slider: 'Slider', knob: 'Knob' }[action.componentType] || action.componentType
      hint.textContent = `💡 This action is designed for: ${label} — consider switching the type tab.`
      hint.style.display = ''
    } else {
      hint.style.display = 'none'
    }
  })

  document.getElementById('s-action-type').addEventListener('change', e => showSliderActionFields(e.target.value))
  document.getElementById('k-action-type').addEventListener('change', e => showKnobActionFields(e.target.value))
  document.getElementById('t-action-type').addEventListener('change', e => showSwitchActionFields(e.target.value))
  document.getElementById('voice-mode').addEventListener('change', e => {
    document.getElementById('voice-cmd-field').style.display = e.target.value === 'template' ? '' : 'none'
  })
}

// ── Rendering ─────────────────────────────────────────
function renderAll() { renderTabs(); renderGrid() }

let renamingPageIdx = null

function renderTabs() {
  const pages = adminPages()
  const idx   = adminIdx()
  const tabs  = document.getElementById('page-tabs')
  tabs.innerHTML = ''

  if (adminFolderStack.length) {
    const bc = document.createElement('div')
    bc.className = 'folder-breadcrumb'
    const crumbs = adminFolderStack.map(f => f.folderComp.label || 'Folder').join(' › ')
    bc.innerHTML = `<button class="folder-back-btn" id="folder-back-btn">← Back</button><span class="folder-crumb">📁 ${crumbs}</span>`
    bc.querySelector('#folder-back-btn').addEventListener('click', exitFolderAdmin)
    tabs.appendChild(bc)
  }

  pages.forEach((page, i) => {
    const tab = document.createElement('div')
    tab.className = 'tab' + (i === idx ? ' active' : '')
    tab.innerHTML = `<span class="tab-name">${page.name}</span>${pages.length > 1 ? `<button class="tab-del" data-i="${i}">✕</button>` : ''}`
    tab.addEventListener('click', (e) => { if (!e.target.classList.contains('tab-del')) { setAdminIdx(i); renderAll() } })
    tab.querySelector('.tab-name').addEventListener('dblclick', (e) => { e.stopPropagation(); openRenameModal(i) })
    tabs.appendChild(tab)
  })
  tabs.querySelectorAll('.tab-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i)
      const pages = adminPages()
      if (!confirm(`Delete page "${pages[i].name}"?`)) return
      pages.splice(i, 1)
      if (adminIdx() >= pages.length) setAdminIdx(pages.length - 1)
      pushConfig(); renderAll()
    })
  })
}

function openRenameModal(pageIdx) {
  renamingPageIdx = pageIdx
  document.getElementById('f-rename-name').value = adminPages()[pageIdx].name
  document.getElementById('rename-modal').style.display = 'flex'
  setTimeout(() => document.getElementById('f-rename-name').select(), 50)
}

function closeRenameModal() {
  document.getElementById('rename-modal').style.display = 'none'
  renamingPageIdx = null
}

function saveRename() {
  if (renamingPageIdx === null) return
  const name = document.getElementById('f-rename-name').value.trim()
  if (!name) return
  adminPages()[renamingPageIdx].name = name
  pushConfig(); renderTabs()
  closeRenameModal()
}

// Convert pointer position to grid cell (1-indexed)
function ptrToCell(e, gridEl, cols, rows) {
  const r = gridEl.getBoundingClientRect()
  return {
    col: Math.max(1, Math.min(cols, Math.ceil((e.clientX - r.left) / r.width  * cols))),
    row: Math.max(1, Math.min(rows, Math.ceil((e.clientY - r.top)  / r.height * rows)))
  }
}

function renderGrid() {
  const gridEl = document.getElementById('grid')
  const page   = adminPages()[adminIdx()]
  const cols   = page.cols || config.grid.cols
  const rows   = config.grid.rows
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  gridEl.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  gridEl.innerHTML = ''

  // Ghost cells — background grid, drop targets for dragged components
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const ghost = document.createElement('div')
      ghost.className        = 'ghost-cell'
      ghost.style.gridColumn = c
      ghost.style.gridRow    = r
      ghost.addEventListener('dragover',  (e) => { e.preventDefault(); ghost.classList.add('drag-over') })
      ghost.addEventListener('dragleave', ()  => ghost.classList.remove('drag-over'))
      ghost.addEventListener('drop', (e) => {
        e.preventDefault()
        ghost.classList.remove('drag-over')
        let data
        try { data = JSON.parse(e.dataTransfer.getData('application/json')) } catch { return }
        createComponentAtCell(data.compType, data.pluginKey, data.label, c, r, data.options || {})
      })
      gridEl.appendChild(ghost)
    }
  }

  // Component cards — placed on top of ghost cells
  for (const comp of (page.components || [])) {
    const card = document.createElement('div')
    card.className         = 'comp-card'
    card.style.gridColumn  = `${comp.col} / span ${comp.colSpan || 1}`
    card.style.gridRow     = `${comp.row} / span ${comp.rowSpan || 1}`
    card.style.background  = comp.color || '#1e293b'
    if (comp.image && serverInfo) {
      card.style.backgroundImage    = `url(https://${serverInfo.ip}:${serverInfo.port}${comp.image})`
      card.style.backgroundSize     = 'cover'
      card.style.backgroundPosition = 'center'
    }

    switch (comp.componentType) {
      case 'slider': {
        const horiz   = comp.orientation === 'horizontal'
        const initPct = (isFinite(comp.min) && isFinite(comp.max) && comp.max > comp.min)
          ? Math.max(0, Math.min(100, ((comp.defaultValue ?? 50) - comp.min) / (comp.max - comp.min) * 100))
          : 50

        card.innerHTML = `
          <div class="card-slider ${horiz ? 'horiz' : 'vert'}">
            <div class="card-slider-track">
              <div class="card-slider-fill"></div>
              <div class="card-slider-thumb"></div>
            </div>
            <div class="card-slider-val">${Math.round(comp.defaultValue ?? 50)}</div>
          </div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`

        const sliderTrack = card.querySelector('.card-slider-track')
        const sliderFill  = card.querySelector('.card-slider-fill')
        const sliderThumb = card.querySelector('.card-slider-thumb')
        const sliderVal   = card.querySelector('.card-slider-val')
        const HALF = 8

        function applySliderPct(pct) {
          const num = (comp.min ?? 0) + ((comp.max ?? 100) - (comp.min ?? 0)) * pct / 100
          sliderVal.textContent = Math.round(num)
          if (horiz) {
            sliderFill.style.width  = `${pct}%`
            sliderThumb.style.left  = `calc(${pct}% - ${HALF}px)`
          } else {
            sliderFill.style.height  = `${pct}%`
            sliderThumb.style.bottom = `calc(${pct}% - ${HALF}px)`
          }
        }
        applySliderPct(initPct)

        sliderTrack.addEventListener('pointerdown', (e) => {
          e.stopPropagation()
          e.preventDefault()
          sliderTrack.setPointerCapture(e.pointerId)
          sliderTrack.style.cursor = 'grabbing'

          function getPct(e) {
            const r = sliderTrack.getBoundingClientRect()
            return horiz
              ? Math.max(0, Math.min(100, (e.clientX - r.left)  / r.width  * 100))
              : Math.max(0, Math.min(100, (r.bottom - e.clientY) / r.height * 100))
          }

          const onMove = (e) => applySliderPct(getPct(e))
          const onUp   = (e) => {
            const pct = getPct(e)
            applySliderPct(pct)
            comp.defaultValue = (comp.min ?? 0) + ((comp.max ?? 100) - (comp.min ?? 0)) * pct / 100
            pushConfig()
            sliderTrack.style.cursor = ''
            sliderTrack.removeEventListener('pointermove', onMove)
            sliderTrack.removeEventListener('pointerup',   onUp)
          }
          sliderTrack.addEventListener('pointermove', onMove)
          sliderTrack.addEventListener('pointerup',   onUp)
        })
        break
      }
      case 'switch':
      case 'toggle':
        card.innerHTML = `
          <div class="cell-type-badge">switch</div>
          <div class="cell-switch-preview"><div class="cell-switch-thumb"></div></div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`
        break
      case 'knob':
        card.innerHTML = `
          <div class="cell-type-badge">knob</div>
          <div class="cell-knob-preview">◎</div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`
        break
      case 'tile':
        card.innerHTML = `
          <div class="cell-type-badge">tile</div>
          <div class="cell-tile-cmd">${(comp.pollCommand || '').substring(0, 26)}</div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`
        break
      case 'spotify':
        card.innerHTML = `
          <div class="cell-type-badge">spotify</div>
          <div class="cell-icon">🎵</div>
          <div class="cell-label">Spotify tile</div>
          <div class="resize-handle"></div>`
        break
      case 'voice':
        card.innerHTML = `
          <div class="cell-type-badge">voice</div>
          <div class="cell-icon">${comp.icon || '🎤'}</div>
          <div class="cell-label">${comp.label || 'Voice'}</div>
          <div class="resize-handle"></div>`
        break
      case 'plugin-tile':
        card.innerHTML = `
          <div class="cell-type-badge">plugin</div>
          <div class="cell-tile-cmd">${comp.pluginTileId || ''}:${comp.pluginTileEvent || ''}</div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`
        break
      case 'folder': {
        const fpCount = (comp.pages || []).length
        card.innerHTML = `
          <div class="cell-type-badge">folder</div>
          <div class="cell-icon">${comp.icon || '📁'}</div>
          <div class="cell-label">${comp.label || 'Folder'}</div>
          ${fpCount ? `<div class="cell-hold-badge">${fpCount}p</div>` : ''}
          <div class="resize-handle"></div>`
        break
      }
      default:
        card.innerHTML = `
          <div class="cell-icon">${comp.icon || ''}</div>
          <div class="cell-label">${comp.label || ''}</div>
          ${comp.holdAction ? '<div class="cell-hold-badge">⟳</div>' : ''}
          <div class="resize-handle"></div>`
    }

    // ── Resize handle (bottom-right corner drag) ──
    const handle = card.querySelector('.resize-handle')
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)

      function onMove(e) {
        const cell     = ptrToCell(e, gridEl, cols, rows)
        comp.colSpan   = Math.max(1, Math.min(cols - comp.col + 1, cell.col - comp.col + 1))
        comp.rowSpan   = Math.max(1, Math.min(rows - comp.row + 1, cell.row - comp.row + 1))
        card.style.gridColumn = `${comp.col} / span ${comp.colSpan}`
        card.style.gridRow    = `${comp.row} / span ${comp.rowSpan}`
      }
      function onUp() {
        pushConfig()
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    })

    // ── Drag to move (pointer events on card body) ──
    let moved = false, startX = 0, startY = 0

    card.addEventListener('pointerdown', (e) => {
      if (e.target === handle || handle.contains(e.target)) return
      e.preventDefault()
      card.setPointerCapture(e.pointerId)
      moved  = false
      startX = e.clientX
      startY = e.clientY
      card.style.cursor = 'grabbing'

      function onMove(e) {
        const dx = e.clientX - startX, dy = e.clientY - startY
        if (!moved && dx * dx + dy * dy < 36) return
        moved = true
        const cell   = ptrToCell(e, gridEl, cols, rows)
        const newCol = Math.max(1, Math.min(cols - (comp.colSpan || 1) + 1, cell.col))
        const newRow = Math.max(1, Math.min(rows - (comp.rowSpan || 1) + 1, cell.row))
        comp.col = newCol; comp.row = newRow
        card.style.gridColumn = `${newCol} / span ${comp.colSpan || 1}`
        card.style.gridRow    = `${newRow} / span ${comp.rowSpan || 1}`
      }
      function onUp() {
        card.style.cursor = ''
        if (moved) pushConfig()
        else openModal(adminIdx(), comp.id, comp.col, comp.row)
        card.removeEventListener('pointermove', onMove)
        card.removeEventListener('pointerup', onUp)
      }
      card.addEventListener('pointermove', onMove)
      card.addEventListener('pointerup', onUp)
    })

    gridEl.appendChild(card)
  }
}

// ── Config ────────────────────────────────────────────
function pushConfig() { window.api.setConfig(config) }

// ── Component type tabs ───────────────────────────────
function setCompType(type) {
  currentCompType = type
  const uiType = type === 'toggle' ? 'switch' : type
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === uiType))
  for (const t of ['button', 'switch', 'slider', 'knob', 'spotify', 'tile', 'voice', 'plugin-tile', 'folder']) {
    const el = document.getElementById(`comp-${t}`)
    if (el) el.style.display = t === uiType ? 'block' : 'none'
  }
}

function showActionFields(type) {
  for (const t of ['builtin', 'hotkey', 'command', 'sequence', 'page']) {
    document.getElementById(`action-${t}`).style.display = t === type ? 'block' : 'none'
  }
  if (type === 'page') populatePageTargets(document.getElementById('f-page-target').value || null)
}

// ── Modal ─────────────────────────────────────────────
function openModal(pageIdx, compId, col, row) {
  editingComp   = { pageIdx, compId, col: col || 1, row: row || 1 }
  pendingImages = {}
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
    showActionFields(at)

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

function closeModal() { document.getElementById('drawer').classList.remove('open'); editingComp = null }

function fillPageSelect(selId, selectedId = null) {
  const sel = document.getElementById(selId)
  if (!sel) return
  sel.innerHTML = ''
  config.pages.forEach(p => {
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name
    if (p.id === selectedId) opt.selected = true
    sel.appendChild(opt)
  })
}
function populatePageTargets(selectedId = null) { fillPageSelect('f-page-target', selectedId) }

function saveModal() {
  const { pageIdx, compId, col, row } = editingComp
  const components = adminPages()[pageIdx].components
  const existing   = compId ? components.find(c => c.id === compId) : null

  const colSpan = Math.max(1, parseInt(document.getElementById('f-col-span').value) || 1)
  const rowSpan = Math.max(1, parseInt(document.getElementById('f-row-span').value) || 1)
  const ea      = getAppearanceFields(existing)
  let fields    = {}

  if (currentCompType === 'button') {
    const at = document.getElementById('f-action-type').value
    let action
    switch (at) {
      case 'builtin':  action = { type: 'builtin',  key:      document.getElementById('f-builtin-key').value }; break
      case 'hotkey':   action = { type: 'hotkey',   combo:    document.getElementById('f-hotkey').value.trim() }; break
      case 'command':  action = { type: 'command',  command:  document.getElementById('f-command').value.trim() }; break
      case 'sequence': action = { type: 'sequence', commands: document.getElementById('f-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('f-seq-delay').value) || 150 }; break
      case 'page':     action = { type: 'page',     pageId:   document.getElementById('f-page-target').value }; break
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

  if (currentCompType === 'switch' || currentCompType === 'toggle') {
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
      activeColor: document.getElementById('ea-active-color').value,
      action:      tAction
    }
  }

  if (currentCompType === 'slider') {
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
      orientation:    existing?.orientation || 'vertical',
      min:            parseFloat(document.getElementById('s-min').value)     || 0,
      max:            parseFloat(document.getElementById('s-max').value)     || 100,
      step:           parseFloat(document.getElementById('s-step').value)    || 5,
      defaultValue:   parseFloat(document.getElementById('s-default').value) || 50,
      infiniteScroll: document.getElementById('s-infinite').checked,
      action:         sAction
    }
  }

  if (currentCompType === 'knob') {
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
      min:            parseFloat(document.getElementById('k-min').value)     || 0,
      max:            parseFloat(document.getElementById('k-max').value)     || 100,
      step:           parseFloat(document.getElementById('k-step').value)    || 1,
      defaultValue:   parseFloat(document.getElementById('k-default').value) || 50,
      infiniteScroll: document.getElementById('k-infinite').checked,
      action:         kAction
    }
  }

  if (currentCompType === 'tile') {
    fields = {
      componentType: 'tile',
      label:        ea.label,
      color:        ea.color,
      pollCommand:  document.getElementById('tile-command').value.trim(),
      pollInterval: parseInt(document.getElementById('tile-interval').value) || 5,
      tileFormat:   document.getElementById('tile-format').value.trim() || '{value}',
      tileTapCmd:   document.getElementById('tile-tap-cmd').value.trim()
    }
  }

  if (currentCompType === 'spotify') {
    fields = {
      componentType: 'spotify',
      color:  ea.color,
      action: { type: 'builtin', key: 'media.playPause' }
    }
  }

  if (currentCompType === 'voice') {
    const mode = document.getElementById('voice-mode').value
    fields = {
      componentType: 'voice',
      icon:         ea.icon || '🎤',
      label:        ea.label || 'Voice',
      color:        ea.color,
      voiceMode:    mode,
      voiceCommand: document.getElementById('voice-command').value.trim()
    }
  }

  if (currentCompType === 'plugin-tile') {
    fields = {
      componentType:   'plugin-tile',
      label:           ea.label,
      color:           ea.color,
      pluginTileId:    document.getElementById('ptile-plugin-id').value.trim(),
      pluginTileEvent: document.getElementById('ptile-event').value.trim(),
      pluginTileField: document.getElementById('ptile-field').value.trim() || 'value'
    }
  }

  if (currentCompType === 'folder') {
    fields = {
      componentType: 'folder',
      icon:  ea.icon  || '📁',
      label: ea.label || 'Folder',
      color: ea.color,
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

function deleteComp() {
  const { pageIdx, compId } = editingComp
  const page = adminPages()[pageIdx]
  page.components = page.components.filter(c => c.id !== compId)
  pushConfig(); renderGrid(); closeModal()
}

// ── Add Page ──────────────────────────────────────────
function closePageModal() { document.getElementById('page-modal').style.display = 'none' }
function saveNewPage() {
  const name    = document.getElementById('f-page-name').value.trim()
  if (!name) return
  const pageCols = parseInt(document.getElementById('f-page-cols').value) || undefined
  const page     = { id: 'page-' + Date.now(), name, components: [] }
  if (pageCols) page.cols = pageCols
  const pages = adminPages()
  pages.push(page)
  setAdminIdx(pages.length - 1)
  pushConfig(); renderAll(); closePageModal()
}

function openPageModal() {
  document.getElementById('f-page-name').value = ''
  document.getElementById('f-page-cols').value = ''
  document.getElementById('page-modal').style.display = 'flex'
  document.getElementById('f-page-name').focus()
}

// ── Component panel ───────────────────────────────────
function cpTypeIcon(compType) {
  const icons = { button: '⬛', switch: '⊙', slider: '▮', knob: '◎', tile: '📊', spotify: '🎵', voice: '🎤', 'plugin-tile': '🔌', folder: '📁' }
  return icons[compType] || '⬛'
}

function compDefaults(compType) {
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

function createComponentAtCell(compType, pluginKey, label, col, row, options = {}) {
  const page = adminPages()[adminIdx()]
  const id   = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const defs = compDefaults(compType)
  Object.assign(defs, options)
  if (pluginKey) defs.action = { type: 'plugin', pluginKey, params: {} }
  const comp = { id, col, row, colSpan: 1, rowSpan: 1, componentType: compType, ...defs }
  page.components.push(comp)
  pushConfig()
  renderGrid()
  openModal(currentPageIdx, id, col, row)
}

const cpCollapsed = new Set()

function makeCpSection(title, items) {
  const section = document.createElement('div')
  section.className = 'cp-section'

  const hdr = document.createElement('div')
  hdr.className = 'cp-section-title cp-collapsible'
  const isCollapsed = cpCollapsed.has(title)
  hdr.innerHTML = `<span>${title}</span><span class="cp-chevron">${isCollapsed ? '▸' : '▾'}</span>`

  const grid = document.createElement('div')
  grid.className = 'cp-grid'
  if (isCollapsed) grid.style.display = 'none'

  hdr.addEventListener('click', () => {
    const collapsed = grid.style.display === 'none'
    grid.style.display = collapsed ? '' : 'none'
    hdr.querySelector('.cp-chevron').textContent = collapsed ? '▾' : '▸'
    if (collapsed) cpCollapsed.delete(title)
    else cpCollapsed.add(title)
  })

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'cp-item'
    el.draggable = true
    el.innerHTML = `<span class="cp-icon">${item.icon}</span><span class="cp-name">${item.label}</span><span class="cp-type">${item.compType}</span>`
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify({
        compType: item.compType,
        pluginKey: item.pluginKey,
        label: item.label,
        options: item.options || {}
      }))
      e.dataTransfer.effectAllowed = 'copy'
    })
    grid.appendChild(el)
  }

  section.appendChild(hdr)
  section.appendChild(grid)
  return section
}

function renderComponentPanel() {
  const panel = document.getElementById('component-panel')
  if (!panel) return
  panel.innerHTML = '<div class="cp-panel-title">Components</div>'

  const coreItems = [
    { compType: 'button', pluginKey: null, label: 'Button',   icon: '⬛', options: {} },
    { compType: 'switch', pluginKey: null, label: 'Switch',   icon: '⊙',  options: {} },
    { compType: 'slider', pluginKey: null, label: 'Slider ↕', icon: '▮',  options: {} },
    { compType: 'slider', pluginKey: null, label: 'Slider ↔', icon: '▬',  options: { orientation: 'horizontal' } },
    { compType: 'knob',   pluginKey: null, label: 'Knob',     icon: '◎',  options: {} },
    { compType: 'tile',   pluginKey: null, label: 'Info Tile',icon: '📊', options: {} },
    { compType: 'voice',  pluginKey: null, label: 'Voice',    icon: '🎤', options: {} },
    { compType: 'folder', pluginKey: null, label: 'Folder',   icon: '📁', options: {} },
  ]
  panel.appendChild(makeCpSection('Controls', coreItems))

  if (loadedPlugins.length) {
    const pluginsCollapsed = cpCollapsed.has('__plugins__')
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
      if (collapsed) cpCollapsed.delete('__plugins__')
      else cpCollapsed.add('__plugins__')
    })

    for (const plugin of loadedPlugins) {
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

// ── Appearance editor ─────────────────────────────────

const SOLID_SWATCHES = [
  '#0f172a','#1e293b','#334155','#475569',
  '#1e3a5f','#1e40af','#2563eb','#3b82f6',
  '#312e81','#4338ca','#4f46e5','#818cf8',
  '#581c87','#7e22ce','#9333ea','#c084fc',
  '#9d174d','#ec4899','#f472b6','#fda4af',
  '#7f1d1d','#dc2626','#f87171','#fca5a5',
  '#7c2d12','#ea580c','#fb923c','#fdba74',
  '#854d0e','#eab308','#fbbf24','#fde68a',
  '#14532d','#22c55e','#4ade80','#bbf7d0',
  '#134e4a','#14b8a6','#2dd4bf','#99f6e4',
]

const GRADIENT_SWATCHES = [
  { label: 'Ocean',  value: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)' },
  { label: 'Purple', value: 'linear-gradient(135deg,#2d1b69,#11998e)' },
  { label: 'Sunset', value: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  { label: 'Fire',   value: 'linear-gradient(135deg,#f12711,#f5af19)' },
  { label: 'Aurora', value: 'linear-gradient(135deg,#00b4db,#0083b0)' },
  { label: 'Neon',   value: 'linear-gradient(135deg,#08f7fe,#09b1e3,#7c3aed)' },
  { label: 'Forest', value: 'linear-gradient(135deg,#134e4a,#22c55e)' },
  { label: 'Candy',  value: 'linear-gradient(135deg,#f472b6,#818cf8)' },
  { label: 'Gold',   value: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { label: 'Dark',   value: 'linear-gradient(135deg,#0f172a,#1e293b)' },
]

const ACTIVE_SWATCHES = ['#4f46e5','#7c3aed','#2563eb','#0891b2','#16a34a','#dc2626','#d97706','#ec4899','#f87171','#4ade80']

const EMOJI_DATA = {
  smileys:  ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😔','😟','😕','🙁','😢','😭','😤','😠','😡','🤬'],
  gestures: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','💪','👏','🙌','🤲','🙏','✍️','💅','🫶','🫵','🤳'],
  nature:   ['🌱','🌿','☘️','🍀','🌸','🌺','🌻','🌹','🌷','💐','🍁','🍂','🍃','🌲','🌳','🌴','🌵','🍄','🌾','🌊','🌋','🏔️','🌙','☀️','🌤️','⛅','🌈','❄️','⚡','🌪️','🔥','💧','🌍'],
  objects:  ['💡','🔦','🖥️','💻','⌨️','🖱️','📱','📷','🎮','🕹️','🎧','🎤','📻','📺','⏰','🔑','🗝️','🔒','🔓','🔨','⚙️','🔧','🔩','💊','📚','📖','✏️','📝','📌','📎','📐','📏','🎁','🏆','🥇','🎭','🎨'],
  symbols:  ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','✨','💫','🎉','🎊','🎈','🎯','✅','❌','⚠️','🔔','🔕','📢','💬','💭','🔴','🟠','🟡','🟢','🔵','🟣'],
  tech:     ['💻','🖥️','⌨️','🖱️','🖨️','📱','📲','☎️','📞','🔋','🔌','💾','💿','📀','📡','⚡','🔭','🔬','🧲','💡','🛠️','⚙️','🔧','🔨','🧰','🧪'],
  gaming:   ['🎮','🕹️','👾','🎲','🎯','🎳','♟️','🃏','🀄','🎴','🧩','🎰','🏆','🥇','🥈','🥉','🎭','🎪','🎠','🎡','🎢','🎟️'],
  media:    ['▶️','⏸️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','🔀','🔁','🔂','🔊','🔉','🔈','🔇','📢','📣','🔔','🎵','🎶','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎬','🎥','📽️'],
}
const ALL_EMOJIS = [...new Set(Object.values(EMOJI_DATA).flat())]

let currentGradient = null
let currentEmojiCat = 'smileys'

function initAppearanceEditor() {
  // Solid swatches
  const solidCtn = document.getElementById('ea-solid-swatches')
  for (const color of SOLID_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset.color = color; s.title = color
    s.addEventListener('click', () => {
      currentGradient = null
      document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(g => g.classList.remove('selected'))
      document.getElementById('ea-color').value = color
      highlightSwatch('ea-solid-swatches', color)
      updatePreviewNow()
    })
    solidCtn.appendChild(s)
  }

  // Gradient swatches
  const gradCtn = document.getElementById('ea-gradient-swatches')
  for (const g of GRADIENT_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'gradient-swatch'; s.style.background = g.value; s.dataset.gradient = g.value; s.title = g.label
    s.addEventListener('click', () => {
      currentGradient = g.value
      document.querySelectorAll('#ea-solid-swatches .swatch').forEach(sw => sw.classList.remove('selected'))
      highlightGradientSwatch(g.value)
      updatePreviewNow()
    })
    gradCtn.appendChild(s)
  }

  // Active color swatches (switch)
  const activeCtn = document.getElementById('ea-active-swatches')
  for (const color of ACTIVE_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset.color = color
    s.addEventListener('click', () => {
      document.getElementById('ea-active-color').value = color
      document.getElementById('t-active-color').value  = color
      highlightSwatch('ea-active-swatches', color)
    })
    activeCtn.appendChild(s)
  }

  // Emoji toggle
  const emojiPanel  = document.getElementById('ea-emoji-panel')
  const emojiToggle = document.getElementById('ea-emoji-toggle')
  let emojiInited   = false
  emojiToggle.addEventListener('click', () => {
    const open = emojiPanel.style.display === 'none'
    emojiPanel.style.display = open ? '' : 'none'
    emojiToggle.textContent  = open ? 'Close ▴' : 'Pick emoji ▾'
    if (open && !emojiInited) { emojiInited = true; renderEmojiCats(); renderEmojiGrid(currentEmojiCat) }
  })

  // Emoji search
  document.getElementById('ea-emoji-search').addEventListener('input', (e) => {
    const q = e.target.value.trim()
    renderEmojiGridItems(q ? ALL_EMOJIS.filter(em => em.includes(q)) : EMOJI_DATA[currentEmojiCat])
  })

  // Color inputs → preview
  document.getElementById('ea-color').addEventListener('input', () => { currentGradient = null; updatePreviewNow() })
  document.getElementById('ea-active-color').addEventListener('input', e => {
    document.getElementById('t-active-color').value = e.target.value
  })
  document.getElementById('ea-icon').addEventListener('input', updatePreviewNow)
  document.getElementById('ea-label').addEventListener('input', updatePreviewNow)
  document.getElementById('ea-img-url').addEventListener('input', updatePreviewNow)

  // Image upload (ea)
  document.getElementById('ea-img-upload-btn').addEventListener('click', () => document.getElementById('ea-img-file').click())
  document.getElementById('ea-img-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const url = await window.api.uploadMedia(file.path)
    pendingImages.image = url
    showEaImagePreview(url)
    updatePreviewNow()
  })
  document.getElementById('ea-img-clear-btn').addEventListener('click', () => {
    pendingImages.image = null
    document.getElementById('ea-img-preview').style.display     = 'none'
    document.getElementById('ea-img-clear-btn').style.display   = 'none'
    document.getElementById('ea-img-file').value                = ''
    document.getElementById('ea-img-url').value                 = ''
    updatePreviewNow()
  })
}

function renderEmojiCats() {
  const catsEl = document.getElementById('ea-emoji-cats')
  catsEl.innerHTML = ''
  const cats = [
    { key: 'smileys',  icon: '😊' }, { key: 'gestures', icon: '👋' },
    { key: 'nature',   icon: '🌿' }, { key: 'objects',  icon: '💡' },
    { key: 'symbols',  icon: '⭐' }, { key: 'tech',     icon: '💻' },
    { key: 'gaming',   icon: '🎮' }, { key: 'media',    icon: '🎵' },
  ]
  for (const cat of cats) {
    const btn = document.createElement('button')
    btn.className = 'emoji-cat' + (cat.key === currentEmojiCat ? ' active' : '')
    btn.title = cat.key; btn.textContent = cat.icon
    btn.addEventListener('click', () => {
      currentEmojiCat = cat.key
      document.getElementById('ea-emoji-search').value = ''
      catsEl.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderEmojiGrid(cat.key)
    })
    catsEl.appendChild(btn)
  }
}

function renderEmojiGrid(cat) { renderEmojiGridItems(EMOJI_DATA[cat] || ALL_EMOJIS) }

function renderEmojiGridItems(emojis) {
  const grid = document.getElementById('ea-emoji-grid')
  grid.innerHTML = ''
  for (const em of emojis) {
    const btn = document.createElement('div')
    btn.className = 'emoji-item'; btn.textContent = em
    btn.addEventListener('click', () => {
      document.getElementById('ea-icon').value = em
      updatePreviewNow()
      document.getElementById('ea-emoji-panel').style.display = 'none'
      document.getElementById('ea-emoji-toggle').textContent  = 'Pick emoji ▾'
    })
    grid.appendChild(btn)
  }
}

function highlightSwatch(containerId, color) {
  document.querySelectorAll(`#${containerId} .swatch`).forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color)
  })
}

function highlightGradientSwatch(gradient) {
  document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.gradient === gradient)
  })
}

function showEaImagePreview(url) {
  if (!url) return
  const full = url.startsWith('http') ? url : (serverInfo ? `https://${serverInfo.ip}:${serverInfo.port}${url}` : url)
  const el = document.getElementById('ea-img-preview')
  el.style.backgroundImage = `url(${full})`
  el.style.display = 'block'
  document.getElementById('ea-img-clear-btn').style.display = 'inline-block'
}

function updatePreviewNow() {
  const icon    = document.getElementById('ea-icon').value
  const label   = document.getElementById('ea-label').value
  const color   = document.getElementById('ea-color').value
  const imgUrl  = document.getElementById('ea-img-url').value.trim()
  const preview = document.getElementById('ea-preview')

  preview.style.background = currentGradient || color

  if (imgUrl) {
    preview.style.backgroundImage    = `url(${imgUrl})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else if (pendingImages.image && serverInfo) {
    const full = pendingImages.image.startsWith('http') ? pendingImages.image : `https://${serverInfo.ip}:${serverInfo.port}${pendingImages.image}`
    preview.style.backgroundImage    = `url(${full})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else {
    preview.style.backgroundImage = ''
  }

  document.getElementById('ea-preview-icon').textContent  = icon
  document.getElementById('ea-preview-label').textContent = label
}

function setAppearanceFromComp(comp, uiType) {
  const defaultColor = ['tile','spotify','plugin-tile'].includes(uiType) ? '#0f172a' : '#1e293b'
  currentGradient    = null

  document.getElementById('ea-icon').value    = comp?.icon  || ''
  document.getElementById('ea-label').value   = comp?.label || ''
  document.getElementById('ea-color').value   = comp?.color || defaultColor
  document.getElementById('ea-img-url').value = ''
  document.getElementById('ea-emoji-panel').style.display = 'none'
  document.getElementById('ea-emoji-toggle').textContent  = 'Pick emoji ▾'

  document.querySelectorAll('#ea-solid-swatches .swatch').forEach(s => s.classList.remove('selected'))
  document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(s => s.classList.remove('selected'))
  highlightSwatch('ea-solid-swatches', comp?.color || defaultColor)

  if (comp?.image) showEaImagePreview(comp.image)
  else {
    document.getElementById('ea-img-preview').style.display   = 'none'
    document.getElementById('ea-img-clear-btn').style.display = 'none'
  }

  const hasIcon   = ['button','voice','folder'].includes(uiType)
  const hasImage  = uiType === 'button'
  const hasLabel  = uiType !== 'spotify'
  const hasActive = uiType === 'switch'

  document.getElementById('ea-icon-section').style.display   = hasIcon   ? '' : 'none'
  document.getElementById('ea-label-section').style.display  = hasLabel  ? '' : 'none'
  document.getElementById('ea-image-section').style.display  = hasImage  ? '' : 'none'
  document.getElementById('ea-active-section').style.display = hasActive ? '' : 'none'

  if (hasActive) {
    const ac = comp?.activeColor || '#4f46e5'
    document.getElementById('ea-active-color').value = ac
    document.getElementById('t-active-color').value  = ac
    highlightSwatch('ea-active-swatches', ac)
  }

  updatePreviewNow()
}

function getAppearanceFields(existing) {
  const imgUrl      = document.getElementById('ea-img-url').value.trim()
  let   image
  if (imgUrl) {
    image = imgUrl
  } else if (pendingImages.image !== undefined) {
    image = pendingImages.image
  } else {
    image = existing?.image ?? null
  }
  return {
    label: document.getElementById('ea-label').value.trim(),
    icon:  document.getElementById('ea-icon').value.trim(),
    color: currentGradient || document.getElementById('ea-color').value,
    image,
  }
}

// ── Folder sub-pages UI ───────────────────────────────
function renderFolderPagesList(comp, pageIdx, compId) {
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

// ── Event wiring ──────────────────────────────────────
document.getElementById('f-action-type').addEventListener('change', e => showActionFields(e.target.value))
document.getElementById('f-hold-enable').addEventListener('change', e => { document.getElementById('hold-fields').style.display = e.target.checked ? 'block' : 'none' })
document.getElementById('drawer-close').addEventListener('click', closeModal)
document.getElementById('modal-save').addEventListener('click', saveModal)
document.getElementById('modal-delete').addEventListener('click', deleteComp)
document.getElementById('add-page-btn').addEventListener('click', openPageModal)
document.getElementById('marketplace-btn').addEventListener('click', () => window.api.openMarketplace())
document.getElementById('page-modal-close').addEventListener('click', closePageModal)
document.getElementById('page-modal-save').addEventListener('click', saveNewPage)
document.getElementById('page-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePageModal() })
document.getElementById('f-page-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewPage() })

document.getElementById('autostart-toggle').addEventListener('change', e => {
  window.api.setAutostart(e.target.checked)
})


// ── Grid settings ──────────────────────────────────────
document.getElementById('grid-save-btn').addEventListener('click', () => {
  const cols = parseInt(document.getElementById('grid-cols').value)
  const rows = parseInt(document.getElementById('grid-rows').value)
  if (!cols || !rows || cols < 1 || rows < 1) return
  config.grid.cols = cols
  config.grid.rows = rows
  pushConfig(); renderAll()
})

// ── Import / export ────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', async () => {
  await window.api.exportConfig()
})

document.getElementById('import-btn').addEventListener('click', async () => {
  const result = await window.api.importConfig()
  if (!result.ok) {
    if (result.error) alert(result.error)
    return
  }
  config = result.config
  document.getElementById('grid-cols').value = config.grid.cols
  document.getElementById('grid-rows').value = config.grid.rows
  currentPageIdx = 0
  renderAll()
})

// ── Rename page modal ──────────────────────────────────
document.getElementById('rename-modal-close').addEventListener('click', closeRenameModal)
document.getElementById('rename-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('rename-modal')) closeRenameModal()
})
document.getElementById('rename-modal-save').addEventListener('click', saveRename)
document.getElementById('f-rename-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRename() })

// ── Folder events ──────────────────────────────────────
document.getElementById('folder-add-page-btn').addEventListener('click', () => {
  if (!editingComp) return
  const { pageIdx, compId } = editingComp
  const comp = adminPages()[pageIdx].components.find(c => c.id === compId)
  if (!comp) return
  if (!comp.pages) comp.pages = []
  const name = prompt('Sub-page name:', `Page ${comp.pages.length + 1}`)
  if (!name?.trim()) return
  comp.pages.push({ id: `fp-${Date.now()}`, name: name.trim(), components: [] })
  pushConfig()
  renderFolderPagesList(comp, pageIdx, compId)
  renderGrid()
})

document.getElementById('folder-edit-btn').addEventListener('click', () => {
  if (!editingComp) return
  const { pageIdx, compId } = editingComp
  const comp = adminPages()[pageIdx].components.find(c => c.id === compId)
  if (comp) enterFolderAdmin(comp)
})

init()
