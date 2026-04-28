'use strict'

// Matches BUILTIN in keyboard.js — display names for the admin UI
const BUILTIN_ACTIONS = [
  { group: 'Media',  key: 'media.playPause',   label: '⏯  Play / Pause'    },
  { group: 'Media',  key: 'media.next',         label: '⏭  Next Track'      },
  { group: 'Media',  key: 'media.previous',     label: '⏮  Previous Track'  },
  { group: 'Media',  key: 'media.volumeUp',     label: '🔊  Volume Up'       },
  { group: 'Media',  key: 'media.volumeDown',   label: '🔉  Volume Down'     },
  { group: 'Media',  key: 'media.mute',         label: '🔇  Mute Audio'      },
  { group: 'System', key: 'system.lock',        label: '🔒  Lock Screen'     },
  { group: 'System', key: 'system.sleep',       label: '💤  Sleep'           },
  { group: 'System', key: 'system.screenshot',  label: '📷  Screenshot'      },
]

const CERT_HINTS = {
  linux:  'Download cert → double-click → trust in your browser\'s cert manager',
  darwin: 'Download cert → double-click → Keychain Access → Always Trust',
  win32:  'Download cert → double-click → Install → Local Machine → Trusted Root CA',
}

let config         = null
let currentPageIdx = 0
let editingSlot    = null
let platform       = 'linux'

// ── Init ─────────────────────────────────────────────
async function init() {
  ;[config, platform] = await Promise.all([window.api.getConfig(), window.api.getPlatform()])

  document.getElementById('cert-hint').textContent = CERT_HINTS[platform] || CERT_HINTS.linux
  populateBuiltinSelect()
  renderAll()

  window.api.onServerReady((info) => {
    const url = `https://${info.ip}:${info.port}`
    document.getElementById('server-url').textContent = url
    document.getElementById('server-url').href        = url
    document.getElementById('cert-url').href          = `${url}/cert.crt`
    const qr = document.getElementById('qr-img')
    qr.src = info.qr
    qr.style.display = 'block'
  })

  window.api.onDeckEvent((event) => {
    if (event.type === 'connection') {
      const el = document.getElementById('phone-status')
      el.textContent = event.connected ? `Connected (${event.clients})` : 'Disconnected'
      el.className   = 'badge ' + (event.connected ? 'connected' : 'disconnected')
    }
    if (event.type === 'press') {
      const page = config.pages.find(p => p.id === event.pageId)
      const slot = page?.slots[event.slot]
      if (slot) document.getElementById('last-press').textContent = `${slot.icon} ${slot.label}`
    }
  })
}

function populateBuiltinSelect() {
  const sel = document.getElementById('f-builtin-key')
  sel.innerHTML = ''
  let lastGroup = ''
  for (const { group, key, label } of BUILTIN_ACTIONS) {
    if (group !== lastGroup) {
      const og = document.createElement('optgroup')
      og.label = group
      sel.appendChild(og)
      lastGroup = group
    }
    const opt = document.createElement('option')
    opt.value = key
    opt.textContent = label
    sel.appendChild(opt)
  }
}

// ── Rendering ─────────────────────────────────────────
function renderAll() { renderTabs(); renderGrid() }

function renderTabs() {
  const tabs = document.getElementById('page-tabs')
  tabs.innerHTML = ''
  config.pages.forEach((page, i) => {
    const tab = document.createElement('div')
    tab.className = 'tab' + (i === currentPageIdx ? ' active' : '')
    tab.innerHTML = `<span class="tab-name">${page.name}</span>${config.pages.length > 1 ? `<button class="tab-del" data-i="${i}">✕</button>` : ''}`
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-del')) return
      currentPageIdx = i; renderAll()
    })
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

  for (let i = 0; i < cols * rows; i++) {
    const slot = page.slots[i] ?? null
    const cell = document.createElement('div')

    if (slot) {
      cell.className = 'cell filled'
      cell.style.background = slot.color || '#1e293b'
      const typeLabel = slot.action?.type === 'builtin'
        ? BUILTIN_ACTIONS.find(a => a.key === slot.action.key)?.label?.split('  ')[1] || slot.action.key
        : slot.action?.type || ''
      cell.innerHTML = `
        <div class="cell-icon">${slot.icon || ''}</div>
        <div class="cell-label">${slot.label || ''}</div>
        <div class="cell-type">${typeLabel}</div>
      `
    } else {
      cell.className = 'cell empty'
      cell.innerHTML = '<div class="cell-add">+</div>'
    }

    cell.addEventListener('click', () => openModal(currentPageIdx, i))
    grid.appendChild(cell)
  }
}

// ── Config ─────────────────────────────────────────────
function pushConfig() { window.api.setConfig(config) }

// ── Modal ─────────────────────────────────────────────
function openModal(pageIdx, slotIdx) {
  editingSlot = { pageIdx, slotIdx }
  const slot  = config.pages[pageIdx].slots[slotIdx]

  document.getElementById('modal-title').textContent = slot ? 'Edit Button' : 'Add Button'
  document.getElementById('f-icon').value    = slot?.icon  || ''
  document.getElementById('f-label').value   = slot?.label || ''
  document.getElementById('f-color').value   = slot?.color || '#1e293b'

  const actionType = slot?.action?.type || 'builtin'
  document.getElementById('f-type').value = actionType
  showActionFields(actionType)

  const a = slot?.action
  if (a?.type === 'builtin')   document.getElementById('f-builtin-key').value  = a.key || BUILTIN_ACTIONS[0].key
  if (a?.type === 'command')   document.getElementById('f-command').value       = a.command || ''
  if (a?.type === 'toggle')  { document.getElementById('f-toggle-on').value    = a.on  || ''; document.getElementById('f-toggle-off').value = a.off || '' }
  if (a?.type === 'sequence')  document.getElementById('f-sequence').value      = (a.commands || []).join('\n')
  if (a?.type === 'page')      populatePageTargets(a.pageId)
  document.getElementById('f-seq-delay').value = a?.delay ?? 150

  document.getElementById('modal-delete').style.display = slot ? 'block' : 'none'
  document.getElementById('modal').style.display = 'flex'
}

function closeModal() { document.getElementById('modal').style.display = 'none'; editingSlot = null }

function showActionFields(type) {
  for (const t of ['builtin', 'command', 'toggle', 'sequence', 'page']) {
    document.getElementById(`fields-${t}`).style.display = t === type ? 'block' : 'none'
  }
}

function populatePageTargets(selectedId) {
  const sel = document.getElementById('f-page-target')
  sel.innerHTML = ''
  config.pages.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.id; opt.textContent = p.name
    if (p.id === selectedId) opt.selected = true
    sel.appendChild(opt)
  })
}

function saveModal() {
  const { pageIdx, slotIdx } = editingSlot
  const icon  = document.getElementById('f-icon').value.trim()
  const label = document.getElementById('f-label').value.trim()
  const color = document.getElementById('f-color').value
  const type  = document.getElementById('f-type').value

  let action
  switch (type) {
    case 'builtin':  action = { type: 'builtin', key: document.getElementById('f-builtin-key').value }; break
    case 'command':  action = { type: 'command', command: document.getElementById('f-command').value.trim() }; break
    case 'toggle':   action = { type: 'toggle', on: document.getElementById('f-toggle-on').value.trim(), off: document.getElementById('f-toggle-off').value.trim() }; break
    case 'sequence': action = { type: 'sequence', commands: document.getElementById('f-sequence').value.split('\n').map(s => s.trim()).filter(Boolean), delay: parseInt(document.getElementById('f-seq-delay').value) || 150 }; break
    case 'page':     action = { type: 'page', pageId: document.getElementById('f-page-target').value }; break
  }

  config.pages[pageIdx].slots[slotIdx] = { icon, label, color, action }
  pushConfig(); renderGrid(); closeModal()
}

function deleteSlot() {
  const { pageIdx, slotIdx } = editingSlot
  config.pages[pageIdx].slots[slotIdx] = null
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

// ── Events ─────────────────────────────────────────────
document.getElementById('f-type').addEventListener('change', e => showActionFields(e.target.value))
document.getElementById('modal-close').addEventListener('click', closeModal)
document.getElementById('modal-save').addEventListener('click', saveModal)
document.getElementById('modal-delete').addEventListener('click', deleteSlot)
document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
document.getElementById('add-page-btn').addEventListener('click', openPageModal)
document.getElementById('page-modal-close').addEventListener('click', closePageModal)
document.getElementById('page-modal-save').addEventListener('click', saveNewPage)
document.getElementById('page-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePageModal() })
document.getElementById('f-page-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewPage() })

init()
