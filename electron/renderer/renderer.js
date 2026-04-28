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

const CERT_HINTS = {
  linux:  'Download cert → trust in browser cert manager',
  darwin: 'Download cert → Keychain Access → Always Trust',
  win32:  'Download cert → Install → Trusted Root CA',
}

let config          = null
let serverInfo      = null
let currentPageIdx  = 0
let editingSlot     = null
let currentCompType = 'button'
let pendingImages   = {}
let dragSrc         = null

// ── Init ──────────────────────────────────────────────
async function init() {
  ;[config, , serverInfo] = await Promise.all([
    window.api.getConfig(),
    window.api.getPlatform().then(p => { document.getElementById('cert-hint').textContent = CERT_HINTS[p] || CERT_HINTS.linux }),
    window.api.getServerInfo()
  ])

  populateBuiltinSelect()
  wireImageUploads()
  wireOBSActionSelect()
  wirePluginReload()
  await loadAndPopulatePlugins()
  renderAll()

  // Load OBS settings (password not persisted)
  if (config.obsSettings) {
    document.getElementById('obs-host').value = config.obsSettings.host || 'localhost'
    document.getElementById('obs-port').value = config.obsSettings.port || 4455
  }
  if (await window.api.getOBSStatus()) {
    setOBSBadge(true)
  }

  // Load autostart
  const autostart = await window.api.getAutostart()
  document.getElementById('autostart-toggle').checked = autostart

  window.api.onServerReady((info) => {
    serverInfo = info
    const url  = `https://${info.ip}:${info.port}`
    document.getElementById('server-url').textContent = url
    document.getElementById('server-url').href        = url
    document.getElementById('cert-url').href          = `${url}/cert.crt`
    const qr = document.getElementById('qr-img')
    qr.src = info.qr; qr.style.display = 'block'
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
      const slot = page?.slots[event.slot]
      if (slot) {
        const val = event.type === 'slide' ? ` → ${Math.round(event.value)}` : ''
        document.getElementById('last-press').textContent = `${slot.icon || slot.label || '?'}${val}`
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

function setOBSBadge(connected) {
  const el = document.getElementById('obs-status-badge')
  el.textContent  = connected ? '● Connected' : '● Disconnected'
  el.className    = 'obs-status-badge ' + (connected ? 'connected' : 'disconnected')
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

// ── OBS action select ─────────────────────────────────
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

function wireOBSActionSelect() {
  document.getElementById('f-obs-action').addEventListener('change', (e) => {
    document.getElementById('obs-scene-row').style.display  = e.target.value === 'switchScene' ? 'grid' : 'none'
    document.getElementById('obs-source-row').style.display = e.target.value === 'muteToggle'  ? 'grid' : 'none'
  })
}

// ── Rendering ─────────────────────────────────────────
function renderAll() { renderTabs(); renderGrid() }

function renderTabs() {
  const tabs = document.getElementById('page-tabs')
  tabs.innerHTML = ''
  config.pages.forEach((page, i) => {
    const tab = document.createElement('div')
    tab.className = 'tab' + (i === currentPageIdx ? ' active' : '')
    tab.innerHTML = `<span>${page.name}</span>${config.pages.length > 1 ? `<button class="tab-del" data-i="${i}">✕</button>` : ''}`
    tab.addEventListener('click', (e) => { if (!e.target.classList.contains('tab-del')) { currentPageIdx = i; renderAll() } })
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

function renderGrid() {
  const grid = document.getElementById('grid')
  const page = config.pages[currentPageIdx]
  const { cols, rows } = config.grid
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  grid.innerHTML = ''
  dragSrc = null

  for (let i = 0; i < cols * rows; i++) {
    const slot = page.slots[i] ?? null
    const cell = document.createElement('div')

    if (!slot) {
      cell.className = 'cell empty'
      cell.innerHTML = '<div class="cell-add">+</div>'
    } else {
      cell.className = 'cell filled'
      cell.style.background = slot.color || '#1e293b'
      if (slot.image && serverInfo) {
        cell.style.backgroundImage = `url(https://${serverInfo.ip}:${serverInfo.port}${slot.image})`
        cell.style.backgroundSize  = 'cover'
      }

      switch (slot.componentType) {
        case 'slider':
          cell.innerHTML = `
            <div class="cell-type-badge">slider</div>
            <div class="cell-slider-preview">
              <div class="cell-slider-fill" style="height:${((slot.defaultValue - slot.min) / (slot.max - slot.min)) * 100}%"></div>
            </div>
            <div class="cell-label">${slot.label || ''}</div>`
          break
        case 'toggle':
          cell.innerHTML = `
            <div class="cell-type-badge">toggle</div>
            <div class="cell-icon">${slot.icon || ''}</div>
            <div class="cell-label">${slot.label || ''}</div>`
          break
        case 'tile':
          cell.innerHTML = `
            <div class="cell-type-badge">tile</div>
            <div class="cell-tile-cmd">${(slot.pollCommand || '').substring(0, 22)}</div>
            <div class="cell-label">${slot.label || ''}</div>`
          break
        case 'spotify':
          cell.innerHTML = `
            <div class="cell-type-badge">spotify</div>
            <div class="cell-icon">🎵</div>
            <div class="cell-label">Spotify tile</div>`
          break
        default:
          cell.innerHTML = `
            <div class="cell-icon">${slot.icon || ''}</div>
            <div class="cell-label">${slot.label || ''}</div>
            ${slot.holdAction ? '<div class="cell-hold-badge">⟳</div>' : ''}`
      }
    }

    // Click to edit
    cell.addEventListener('click', () => openModal(currentPageIdx, i))

    // Drag-to-reorder
    cell.draggable = true
    cell.addEventListener('dragstart', e => {
      dragSrc = i
      e.dataTransfer.effectAllowed = 'move'
      setTimeout(() => cell.classList.add('dragging'), 0)
    })
    cell.addEventListener('dragend',  () => cell.classList.remove('dragging'))
    cell.addEventListener('dragover',  e => { e.preventDefault(); cell.classList.add('drag-over') })
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'))
    cell.addEventListener('drop', e => {
      e.preventDefault()
      cell.classList.remove('drag-over')
      if (dragSrc === null || dragSrc === i) { dragSrc = null; return }
      const slots = config.pages[currentPageIdx].slots
      const tmp   = slots[dragSrc]
      slots[dragSrc] = slots[i]
      slots[i]       = tmp
      dragSrc = null
      pushConfig(); renderGrid()
    })

    grid.appendChild(cell)
  }
}

// ── Config ────────────────────────────────────────────
function pushConfig() { window.api.setConfig(config) }

// ── Component type tabs ───────────────────────────────
function setCompType(type) {
  currentCompType = type
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type))
  for (const t of ['button', 'toggle', 'slider', 'spotify', 'tile']) {
    document.getElementById(`comp-${t}`).style.display = t === type ? 'block' : 'none'
  }
}

function showActionFields(type) {
  for (const t of ['builtin', 'hotkey', 'command', 'sequence', 'page', 'obs', 'plugin']) {
    document.getElementById(`action-${t}`).style.display = t === type ? 'block' : 'none'
  }
  if (type === 'page') populatePageTargets(document.getElementById('f-page-target').value || null)
}

// ── Modal ─────────────────────────────────────────────
function openModal(pageIdx, slotIdx) {
  editingSlot   = { pageIdx, slotIdx }
  pendingImages = {}
  const slot    = config.pages[pageIdx].slots[slotIdx]

  document.getElementById('modal-title').textContent        = slot ? 'Edit' : 'Add'
  document.getElementById('modal-delete').style.display     = slot ? 'block' : 'none'

  const compType = slot?.componentType || 'button'
  setCompType(compType)

  if (compType === 'button' || !compType) {
    document.getElementById('f-icon').value  = slot?.icon  || ''
    document.getElementById('f-label').value = slot?.label || ''
    document.getElementById('f-color').value = slot?.color || '#1e293b'
    setImageField('img-preview', 'img-clear-btn', slot?.image)

    const at = slot?.action?.type || 'builtin'
    document.getElementById('f-action-type').value = at
    showActionFields(at)

    const a = slot?.action
    if (a?.type === 'builtin')  document.getElementById('f-builtin-key').value = a.key || BUILTIN_ACTIONS[0].key
    if (a?.type === 'hotkey')   document.getElementById('f-hotkey').value       = a.combo || ''
    if (a?.type === 'command')  document.getElementById('f-command').value      = a.command || ''
    if (a?.type === 'sequence') {
      document.getElementById('f-sequence').value  = (a.commands || []).join('\n')
      document.getElementById('f-seq-delay').value = a.delay ?? 150
    }
    if (a?.type === 'page') populatePageTargets(a.pageId)
    if (a?.type === 'obs') {
      document.getElementById('f-obs-action').value = a.obsAction || 'switchScene'
      document.getElementById('f-obs-scene').value  = a.obsScene  || ''
      document.getElementById('f-obs-source').value = a.obsSource || ''
      document.getElementById('f-obs-action').dispatchEvent(new Event('change'))
    }
    if (a?.type === 'plugin') {
      document.getElementById('f-plugin-action').value = a.pluginKey || ''
      renderPluginParams(a.pluginKey || '', a.params || {})
    }

    // Hold action
    const holdCmd = slot?.holdAction?.command || ''
    document.getElementById('f-hold-enable').checked       = !!holdCmd
    document.getElementById('hold-fields').style.display   = holdCmd ? 'block' : 'none'
    document.getElementById('f-hold-command').value        = holdCmd
  }

  if (compType === 'toggle') {
    document.getElementById('t-icon').value         = slot?.icon        || ''
    document.getElementById('t-label').value        = slot?.label       || ''
    document.getElementById('t-color').value        = slot?.color       || '#1e293b'
    document.getElementById('t-active-icon').value  = slot?.activeIcon  || ''
    document.getElementById('t-active-label').value = slot?.activeLabel || ''
    document.getElementById('t-active-color').value = slot?.activeColor || '#4f46e5'
    document.getElementById('t-off-cmd').value      = slot?.action?.off || ''
    document.getElementById('t-on-cmd').value       = slot?.action?.on  || ''
    setImageField('t-img-preview',        't-img-clear-btn',        slot?.image)
    setImageField('t-active-img-preview', 't-active-img-clear-btn', slot?.activeImage)
  }

  if (compType === 'slider') {
    document.getElementById('s-label').value   = slot?.label        || ''
    document.getElementById('s-color').value   = slot?.color        || '#1e293b'
    document.getElementById('s-min').value     = slot?.min          ?? 0
    document.getElementById('s-max').value     = slot?.max          ?? 100
    document.getElementById('s-step').value    = slot?.step         ?? 5
    document.getElementById('s-default').value = slot?.defaultValue ?? 50
    document.getElementById('s-command').value = slot?.action?.command || ''
  }

  if (compType === 'tile') {
    document.getElementById('tile-label').value    = slot?.label        || ''
    document.getElementById('tile-color').value    = slot?.color        || '#0f172a'
    document.getElementById('tile-command').value  = slot?.pollCommand  || ''
    document.getElementById('tile-interval').value = slot?.pollInterval ?? 5
  }

  if (compType === 'spotify') {
    document.getElementById('sp-color').value = slot?.color || '#0f172a'
  }

  document.getElementById('modal').style.display = 'flex'
}

function closeModal() { document.getElementById('modal').style.display = 'none'; editingSlot = null }

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
  const { pageIdx, slotIdx } = editingSlot
  const existing = config.pages[pageIdx].slots[slotIdx]
  let slot = {}

  if (currentCompType === 'button') {
    const at = document.getElementById('f-action-type').value
    let action
    switch (at) {
      case 'builtin':  action = { type: 'builtin',  key:      document.getElementById('f-builtin-key').value }; break
      case 'hotkey':   action = { type: 'hotkey',   combo:    document.getElementById('f-hotkey').value.trim() }; break
      case 'command':  action = { type: 'command',  command:  document.getElementById('f-command').value.trim() }; break
      case 'sequence': action = { type: 'sequence', commands: document.getElementById('f-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('f-seq-delay').value) || 150 }; break
      case 'page':     action = { type: 'page',     pageId:   document.getElementById('f-page-target').value }; break
      case 'obs':      action = { type: 'obs', obsAction: document.getElementById('f-obs-action').value, obsScene: document.getElementById('f-obs-scene').value.trim(), obsSource: document.getElementById('f-obs-source').value.trim() }; break
      case 'plugin':   action = { type: 'plugin', pluginKey: document.getElementById('f-plugin-action').value, params: collectPluginParams() }; break
    }
    const holdEnabled = document.getElementById('f-hold-enable').checked
    const holdCmd     = document.getElementById('f-hold-command').value.trim()
    slot = {
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
    slot = {
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
    slot = {
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
    slot = {
      componentType: 'tile',
      label:        document.getElementById('tile-label').value.trim(),
      color:        document.getElementById('tile-color').value,
      pollCommand:  document.getElementById('tile-command').value.trim(),
      pollInterval: parseInt(document.getElementById('tile-interval').value) || 5
    }
  }

  if (currentCompType === 'spotify') {
    slot = {
      componentType: 'spotify',
      color:  document.getElementById('sp-color').value,
      action: { type: 'builtin', key: 'media.playPause' }
    }
  }

  config.pages[pageIdx].slots[slotIdx] = slot
  pushConfig(); renderGrid(); closeModal()
}

function deleteSlot() {
  config.pages[editingSlot.pageIdx].slots[editingSlot.slotIdx] = null
  pushConfig(); renderGrid(); closeModal()
}

// ── Add Page ──────────────────────────────────────────
function openPageModal()  { document.getElementById('f-page-name').value = ''; document.getElementById('page-modal').style.display = 'flex'; document.getElementById('f-page-name').focus() }
function closePageModal() { document.getElementById('page-modal').style.display = 'none' }
function saveNewPage() {
  const name = document.getElementById('f-page-name').value.trim()
  if (!name) return
  const { cols, rows } = config.grid
  config.pages.push({ id: 'page-' + Date.now(), name, slots: Array(cols * rows).fill(null) })
  currentPageIdx = config.pages.length - 1
  pushConfig(); renderAll(); closePageModal()
}

// ── Event wiring ──────────────────────────────────────
document.querySelectorAll('.type-tab').forEach(btn => btn.addEventListener('click', () => setCompType(btn.dataset.type)))
document.getElementById('f-action-type').addEventListener('change', e => showActionFields(e.target.value))
document.getElementById('f-hold-enable').addEventListener('change', e => { document.getElementById('hold-fields').style.display = e.target.checked ? 'block' : 'none' })
document.getElementById('modal-close').addEventListener('click', closeModal)
document.getElementById('modal-save').addEventListener('click', saveModal)
document.getElementById('modal-delete').addEventListener('click', deleteSlot)
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

document.getElementById('obs-connect-btn').addEventListener('click', async () => {
  const host     = document.getElementById('obs-host').value.trim()     || 'localhost'
  const port     = parseInt(document.getElementById('obs-port').value)  || 4455
  const password = document.getElementById('obs-password').value

  const btn = document.getElementById('obs-connect-btn')
  btn.disabled = true; btn.textContent = 'Connecting…'

  const ok = await window.api.connectOBS({ host, port, password })

  btn.disabled = false; btn.textContent = 'Connect'
  setOBSBadge(ok)

  config.obsSettings = { host, port } // password not persisted — re-enter each session
  pushConfig()
})

init()
