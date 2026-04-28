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
let proStatus       = { active: false }

const PURCHASE_URL = 'https://chunkies.gumroad.com/l/streamdeck-pro'

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
  await loadAndPopulatePlugins()
  renderAll()


  // Load autostart
  const autostart = await window.api.getAutostart()
  document.getElementById('autostart-toggle').checked = autostart

  // Load Claude API key (masked display)
  if (config.claudeApiKey) {
    document.getElementById('claude-api-key').placeholder = '••••••••••••••••••••'
  }

  // Grid settings
  document.getElementById('grid-cols').value = config.grid.cols
  document.getElementById('grid-rows').value = config.grid.rows

  // Pro license
  proStatus = await window.api.getProStatus()
  renderProStatus()
  wireProSection()

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
  const sel = document.getElementById('f-builtin-key')
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

// ── Image uploads ─────────────────────────────────────
function wireImageUploads() {
  const pairs = [
    { btn: 'img-upload-btn',          clear: 'img-clear-btn',          input: 'img-file-input',          preview: 'img-preview',          field: 'image'       },
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

function populatePluginSelect(plugins) {
  loadedPlugins = plugins || []
  const sel = document.getElementById('f-plugin-action')
  sel.innerHTML = ''
  if (!loadedPlugins.length) {
    sel.innerHTML = '<option value="">— no plugins installed —</option>'
    renderPluginParams('', {})
    return
  }
  for (const plugin of loadedPlugins) {
    const og = document.createElement('optgroup')
    og.label = plugin.name
    for (const action of plugin.actions) {
      const opt = document.createElement('option')
      opt.value = action.key
      opt.textContent = action.label
      og.appendChild(opt)
    }
    sel.appendChild(og)
  }
  renderPluginParams(sel.value, {})
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

function wirePluginReload() {
  document.getElementById('plugin-reload-btn').addEventListener('click', async () => {
    const plugins = await window.api.reloadPlugins()
    populatePluginSelect(plugins)
  })
  document.getElementById('f-plugin-action').addEventListener('change', (e) => {
    renderPluginParams(e.target.value, {})
  })
}

// ── Rendering ─────────────────────────────────────────
function renderAll() { renderTabs(); renderGrid() }

let renamingPageIdx = null

function renderTabs() {
  const tabs = document.getElementById('page-tabs')
  tabs.innerHTML = ''
  config.pages.forEach((page, i) => {
    const tab = document.createElement('div')
    tab.className = 'tab' + (i === currentPageIdx ? ' active' : '')
    tab.innerHTML = `<span class="tab-name">${page.name}</span>${config.pages.length > 1 ? `<button class="tab-del" data-i="${i}">✕</button>` : ''}`
    tab.addEventListener('click', (e) => { if (!e.target.classList.contains('tab-del')) { currentPageIdx = i; renderAll() } })
    tab.querySelector('.tab-name').addEventListener('dblclick', (e) => { e.stopPropagation(); openRenameModal(i) })
    tabs.appendChild(tab)
  })
  tabs.querySelectorAll('.tab-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i)
      if (!confirm(`Delete page "${config.pages[i].name}"?`)) return
      config.pages.splice(i, 1)
      if (currentPageIdx >= config.pages.length) currentPageIdx = config.pages.length - 1
      pushConfig(); renderAll()
    })
  })
}

function openRenameModal(pageIdx) {
  renamingPageIdx = pageIdx
  document.getElementById('f-rename-name').value = config.pages[pageIdx].name
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
  config.pages[renamingPageIdx].name = name
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
  const page   = config.pages[currentPageIdx]
  const cols   = page.cols || config.grid.cols
  const rows   = config.grid.rows
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  gridEl.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  gridEl.innerHTML = ''

  // Ghost cells — background grid, click to add
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const ghost = document.createElement('div')
      ghost.className        = 'ghost-cell'
      ghost.style.gridColumn = c
      ghost.style.gridRow    = r
      ghost.innerHTML        = '<div class="cell-add">+</div>'
      ghost.addEventListener('click', () => openModal(currentPageIdx, null, c, r))
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
      case 'slider':
        card.innerHTML = `
          <div class="cell-type-badge">slider</div>
          <div class="cell-slider-preview">
            <div class="cell-slider-fill" style="height:${((comp.defaultValue - comp.min) / (comp.max - comp.min)) * 100}%"></div>
          </div>
          <div class="cell-label">${comp.label || ''}</div>
          <div class="resize-handle"></div>`
        break
      case 'toggle':
        card.innerHTML = `
          <div class="cell-type-badge">toggle</div>
          <div class="cell-icon">${comp.icon || ''}</div>
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
        else openModal(currentPageIdx, comp.id, comp.col, comp.row)
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
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type))
  for (const t of ['button', 'toggle', 'slider', 'spotify', 'tile', 'voice', 'plugin-tile']) {
    document.getElementById(`comp-${t}`).style.display = t === type ? 'block' : 'none'
  }
}

function showActionFields(type) {
  for (const t of ['builtin', 'hotkey', 'command', 'sequence', 'page', 'plugin']) {
    document.getElementById(`action-${t}`).style.display = t === type ? 'block' : 'none'
  }
  if (type === 'page') populatePageTargets(document.getElementById('f-page-target').value || null)
}

// ── Modal ─────────────────────────────────────────────
function openModal(pageIdx, compId, col, row) {
  editingComp   = { pageIdx, compId, col: col || 1, row: row || 1 }
  pendingImages = {}
  const comp    = compId ? config.pages[pageIdx].components.find(c => c.id === compId) : null

  document.getElementById('modal-title').textContent    = comp ? 'Edit' : 'Add'
  document.getElementById('modal-delete').style.display = comp ? 'block' : 'none'

  document.getElementById('f-col-span').value = comp?.colSpan || 1
  document.getElementById('f-row-span').value = comp?.rowSpan || 1

  const compType = comp?.componentType || 'button'
  setCompType(compType)

  if (compType === 'button' || !compType) {
    document.getElementById('f-icon').value  = comp?.icon  || ''
    document.getElementById('f-label').value = comp?.label || ''
    document.getElementById('f-color').value = comp?.color || '#1e293b'
    setImageField('img-preview', 'img-clear-btn', comp?.image)

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

  if (compType === 'toggle') {
    document.getElementById('t-icon').value         = comp?.icon        || ''
    document.getElementById('t-label').value        = comp?.label       || ''
    document.getElementById('t-color').value        = comp?.color       || '#1e293b'
    document.getElementById('t-active-icon').value  = comp?.activeIcon  || ''
    document.getElementById('t-active-label').value = comp?.activeLabel || ''
    document.getElementById('t-active-color').value = comp?.activeColor || '#4f46e5'
    document.getElementById('t-off-cmd').value      = comp?.action?.off || ''
    document.getElementById('t-on-cmd').value       = comp?.action?.on  || ''
    setImageField('t-img-preview',        't-img-clear-btn',        comp?.image)
    setImageField('t-active-img-preview', 't-active-img-clear-btn', comp?.activeImage)
  }

  if (compType === 'slider') {
    document.getElementById('s-label').value   = comp?.label        || ''
    document.getElementById('s-color').value   = comp?.color        || '#1e293b'
    document.getElementById('s-min').value     = comp?.min          ?? 0
    document.getElementById('s-max').value     = comp?.max          ?? 100
    document.getElementById('s-step').value    = comp?.step         ?? 5
    document.getElementById('s-default').value = comp?.defaultValue ?? 50
    document.getElementById('s-command').value = comp?.action?.command || ''
  }

  if (compType === 'tile') {
    document.getElementById('tile-label').value    = comp?.label        || ''
    document.getElementById('tile-color').value    = comp?.color        || '#0f172a'
    document.getElementById('tile-command').value  = comp?.pollCommand  || ''
    document.getElementById('tile-interval').value = comp?.pollInterval ?? 5
  }

  if (compType === 'spotify') {
    document.getElementById('sp-color').value = comp?.color || '#0f172a'
  }

  if (compType === 'voice') {
    document.getElementById('voice-icon').value  = comp?.icon      || '🎤'
    document.getElementById('voice-label').value = comp?.label     || 'Voice'
    document.getElementById('voice-color').value = comp?.color     || '#1e293b'
    document.getElementById('voice-mode').value  = comp?.voiceMode || 'smart'
  }

  if (compType === 'plugin-tile') {
    document.getElementById('ptile-label').value     = comp?.label           || ''
    document.getElementById('ptile-color').value     = comp?.color           || '#0f172a'
    document.getElementById('ptile-plugin-id').value = comp?.pluginTileId    || ''
    document.getElementById('ptile-event').value     = comp?.pluginTileEvent || ''
    document.getElementById('ptile-field').value     = comp?.pluginTileField || 'value'
  }

  document.getElementById('modal').style.display = 'flex'
}

function closeModal() { document.getElementById('modal').style.display = 'none'; editingComp = null }

function populatePageTargets(selectedId = null) {
  const sel = document.getElementById('f-page-target')
  sel.innerHTML = ''
  config.pages.forEach(p => {
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name
    if (p.id === selectedId) opt.selected = true
    sel.appendChild(opt)
  })
}

function saveModal() {
  const { pageIdx, compId, col, row } = editingComp
  const components = config.pages[pageIdx].components
  const existing   = compId ? components.find(c => c.id === compId) : null

  const colSpan = Math.max(1, parseInt(document.getElementById('f-col-span').value) || 1)
  const rowSpan = Math.max(1, parseInt(document.getElementById('f-row-span').value) || 1)
  let fields = {}

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
      icon:      document.getElementById('f-icon').value.trim(),
      label:     document.getElementById('f-label').value.trim(),
      color:     document.getElementById('f-color').value,
      image:     pendingImages.image !== undefined ? pendingImages.image : (existing?.image ?? null),
      action,
      holdAction: (holdEnabled && holdCmd) ? { type: 'command', command: holdCmd } : null
    }
  }

  if (currentCompType === 'toggle') {
    fields = {
      componentType: 'toggle',
      icon:        document.getElementById('t-icon').value.trim(),
      label:       document.getElementById('t-label').value.trim(),
      color:       document.getElementById('t-color').value,
      image:       pendingImages.image       !== undefined ? pendingImages.image       : (existing?.image       ?? null),
      activeIcon:  document.getElementById('t-active-icon').value.trim(),
      activeLabel: document.getElementById('t-active-label').value.trim(),
      activeColor: document.getElementById('t-active-color').value,
      activeImage: pendingImages.activeImage !== undefined ? pendingImages.activeImage : (existing?.activeImage ?? null),
      action: { type: 'toggle', on: document.getElementById('t-on-cmd').value.trim(), off: document.getElementById('t-off-cmd').value.trim() }
    }
  }

  if (currentCompType === 'slider') {
    fields = {
      componentType: 'slider',
      label:        document.getElementById('s-label').value.trim(),
      color:        document.getElementById('s-color').value,
      min:          parseFloat(document.getElementById('s-min').value)     || 0,
      max:          parseFloat(document.getElementById('s-max').value)     || 100,
      step:         parseFloat(document.getElementById('s-step').value)    || 5,
      defaultValue: parseFloat(document.getElementById('s-default').value) || 50,
      action: { type: 'command', command: document.getElementById('s-command').value.trim() }
    }
  }

  if (currentCompType === 'tile') {
    fields = {
      componentType: 'tile',
      label:        document.getElementById('tile-label').value.trim(),
      color:        document.getElementById('tile-color').value,
      pollCommand:  document.getElementById('tile-command').value.trim(),
      pollInterval: parseInt(document.getElementById('tile-interval').value) || 5
    }
  }

  if (currentCompType === 'spotify') {
    fields = {
      componentType: 'spotify',
      color:  document.getElementById('sp-color').value,
      action: { type: 'builtin', key: 'media.playPause' }
    }
  }

  if (currentCompType === 'voice') {
    const mode = document.getElementById('voice-mode').value
    if (mode === 'ai' && !proStatus.active) { showUpgradeModal(); return }
    fields = {
      componentType: 'voice',
      icon:      document.getElementById('voice-icon').value.trim() || '🎤',
      label:     document.getElementById('voice-label').value.trim() || 'Voice',
      color:     document.getElementById('voice-color').value,
      voiceMode: mode
    }
  }

  if (currentCompType === 'plugin-tile') {
    fields = {
      componentType:   'plugin-tile',
      label:           document.getElementById('ptile-label').value.trim(),
      color:           document.getElementById('ptile-color').value,
      pluginTileId:    document.getElementById('ptile-plugin-id').value.trim(),
      pluginTileEvent: document.getElementById('ptile-event').value.trim(),
      pluginTileField: document.getElementById('ptile-field').value.trim() || 'value'
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
  config.pages[pageIdx].components = config.pages[pageIdx].components.filter(c => c.id !== compId)
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
  config.pages.push(page)
  currentPageIdx = config.pages.length - 1
  pushConfig(); renderAll(); closePageModal()
}

function openPageModal() {
  document.getElementById('f-page-name').value = ''
  document.getElementById('f-page-cols').value = ''
  document.getElementById('page-modal').style.display = 'flex'
  document.getElementById('f-page-name').focus()
}

// ── Event wiring ──────────────────────────────────────
document.querySelectorAll('.type-tab').forEach(btn => btn.addEventListener('click', () => setCompType(btn.dataset.type)))
document.getElementById('f-action-type').addEventListener('change', e => showActionFields(e.target.value))
document.getElementById('f-hold-enable').addEventListener('change', e => { document.getElementById('hold-fields').style.display = e.target.checked ? 'block' : 'none' })
document.getElementById('modal-close').addEventListener('click', closeModal)
document.getElementById('modal-save').addEventListener('click', saveModal)
document.getElementById('modal-delete').addEventListener('click', deleteComp)
document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
document.getElementById('add-page-btn').addEventListener('click', openPageModal)
document.getElementById('marketplace-btn').addEventListener('click', () => window.api.openMarketplace())
document.getElementById('page-modal-close').addEventListener('click', closePageModal)
document.getElementById('page-modal-save').addEventListener('click', saveNewPage)
document.getElementById('page-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePageModal() })
document.getElementById('f-page-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewPage() })

document.getElementById('autostart-toggle').addEventListener('change', e => {
  window.api.setAutostart(e.target.checked)
})


document.getElementById('claude-save-btn').addEventListener('click', () => {
  const key = document.getElementById('claude-api-key').value.trim()
  if (!key) return
  config.claudeApiKey = key
  document.getElementById('claude-api-key').value = ''
  document.getElementById('claude-api-key').placeholder = '••••••••••••••••••••'
  pushConfig()
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

// ── Pro license UI ─────────────────────────────────────
function renderProStatus() {
  const badge        = document.getElementById('pro-badge')
  const activeView   = document.getElementById('pro-active-view')
  const inactiveView = document.getElementById('pro-inactive-view')
  if (proStatus.active) {
    badge.textContent  = 'Pro'
    badge.className    = 'pro-badge pro-badge-pro'
    activeView.style.display   = ''
    inactiveView.style.display = 'none'
  } else {
    badge.textContent  = 'Free'
    badge.className    = 'pro-badge pro-badge-free'
    activeView.style.display   = 'none'
    inactiveView.style.display = ''
  }
}

function wireProSection() {
  document.getElementById('pro-buy-link').href = PURCHASE_URL
  document.getElementById('pro-buy-link').addEventListener('click', (e) => {
    e.preventDefault()
    window.api.openMarketplace && window.open ? null : null
    // openExternal via server-info link trick — just open directly
    const a = document.createElement('a')
    a.href = PURCHASE_URL; a.target = '_blank'; a.rel = 'noopener'; a.click()
  })

  document.getElementById('pro-activate-btn').addEventListener('click', async () => {
    const key = document.getElementById('pro-license-key').value.trim()
    const err = document.getElementById('pro-error')
    err.style.display = 'none'
    if (!key) return
    const result = await window.api.activateLicense(key)
    if (result.ok) {
      proStatus = await window.api.getProStatus()
      renderProStatus()
      document.getElementById('pro-license-key').value = ''
    } else {
      err.textContent = result.error || 'Activation failed'
      err.style.display = ''
    }
  })

  document.getElementById('pro-deactivate-btn').addEventListener('click', async () => {
    await window.api.deactivateLicense()
    proStatus = { active: false }
    renderProStatus()
  })

  // Upgrade modal
  document.getElementById('upgrade-modal-close').addEventListener('click', closeUpgradeModal)
  document.getElementById('upgrade-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('upgrade-modal')) closeUpgradeModal()
  })
  document.getElementById('upgrade-buy-btn').addEventListener('click', () => {
    const a = document.createElement('a')
    a.href = PURCHASE_URL; a.target = '_blank'; a.rel = 'noopener'; a.click()
  })
}

function showUpgradeModal() {
  document.getElementById('upgrade-modal').style.display = 'flex'
}

function closeUpgradeModal() {
  document.getElementById('upgrade-modal').style.display = 'none'
}

init()
