// @ts-nocheck
import { state, adminPages } from './state'
import { pushConfig } from './config'
import { renderAll, renderGrid, enterFolderAdmin, closeRenameModal, saveRename } from './grid'
import { closeModal, saveModal, deleteComp, showButtonActionFields, renderFolderPagesList } from './modal'
import { loadAndPopulatePlugins, wirePluginReload } from './plugins'
import { initAppearanceEditor } from './appearance'
import { wireImageUploads } from './images'
import { closePageModal, saveNewPage, openPageModal } from './pages'
import { BUILTIN_ACTIONS } from './constants'

// ── Server info display ───────────────────────────────
function applyServerInfo(info) {
  document.getElementById('server-url').textContent = info.url
  document.getElementById('server-url').href        = info.url
  document.getElementById('cert-url').href          = `${info.url}/cert.crt`

  const qr = document.getElementById('qr-img')
  if (info.qr) { qr.src = info.qr; qr.style.display = 'block' }

  // Wire cert-setup toggle
  const toggle = document.getElementById('cert-setup-toggle')
  const body   = document.getElementById('cert-setup-body')
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none'
      body.style.display = open ? 'none' : ''
      toggle.textContent = open ? '📱 First time? Phone setup ▾' : '📱 First time? Phone setup ▴'
    })
    // OS tab switching
    document.querySelectorAll('.cert-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const os = (e.currentTarget as HTMLElement).dataset.os
        document.querySelectorAll('.cert-tab').forEach(b => b.classList.remove('active'))
        ;(e.currentTarget as HTMLElement).classList.add('active')
        document.getElementById('cert-steps-ios').style.display     = os === 'ios'     ? '' : 'none'
        document.getElementById('cert-steps-android').style.display = os === 'android' ? '' : 'none'
      })
    })
  }
}

// ── Builtin action selects ────────────────────────────
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

// ── Init ──────────────────────────────────────────────
async function init() {
  ;[state.config, state.serverInfo] = await Promise.all([
    window.api.getConfig(),
    window.api.getServerInfo()
  ])

  populateBuiltinSelect()
  wireImageUploads()
  wirePluginReload()
  initAppearanceEditor()
  await loadAndPopulatePlugins()
  renderAll()

  const autostart = await window.api.getAutostart()
  document.getElementById('autostart-toggle').checked = autostart

  document.getElementById('grid-cols').value = state.config.grid.cols
  document.getElementById('grid-rows').value = state.config.grid.rows

  if (state.serverInfo?.url) applyServerInfo(state.serverInfo)

  window.api.onServerReady((info) => {
    state.serverInfo = info
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
      const page = state.config?.pages.find(p => p.id === event.pageId)
      const comp = page?.components?.find(c => c.id === event.compId)
      if (comp) {
        const val = event.type === 'slide' ? ` → ${Math.round(event.value)}` : ''
        document.getElementById('last-press').textContent = `${comp.icon || comp.label || '?'}${val}`
      }
    }
  })
}

// ── Event wiring ──────────────────────────────────────
document.getElementById('f-action-type').addEventListener('change', e => showButtonActionFields(e.target.value))
document.getElementById('f-hold-enable').addEventListener('change', e => {
  document.getElementById('hold-fields').style.display = e.target.checked ? 'block' : 'none'
})
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

document.getElementById('grid-save-btn').addEventListener('click', () => {
  const cols = parseInt(document.getElementById('grid-cols').value)
  const rows = parseInt(document.getElementById('grid-rows').value)
  if (!cols || !rows || cols < 1 || rows < 1) return
  state.config.grid.cols = cols
  state.config.grid.rows = rows
  pushConfig(); renderAll()
})

document.getElementById('export-btn').addEventListener('click', async () => {
  await window.api.exportConfig()
})

document.getElementById('import-btn').addEventListener('click', async () => {
  const result = await window.api.importConfig()
  if (!result.ok) {
    if (result.error) alert(result.error)
    return
  }
  state.config = result.config
  document.getElementById('grid-cols').value = state.config.grid.cols
  document.getElementById('grid-rows').value = state.config.grid.rows
  state.currentPageIdx   = 0
  state.adminFolderStack = []
  closeModal()
  renderAll()
})

document.getElementById('rename-modal-close').addEventListener('click', closeRenameModal)
document.getElementById('rename-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('rename-modal')) closeRenameModal()
})
document.getElementById('rename-modal-save').addEventListener('click', saveRename)
document.getElementById('f-rename-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveRename() })

document.getElementById('folder-add-page-btn').addEventListener('click', () => {
  if (!state.editingComp) return
  const { pageIdx, compId } = state.editingComp
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
  if (!state.editingComp) return
  const { pageIdx, compId } = state.editingComp
  const comp = adminPages()[pageIdx].components.find(c => c.id === compId)
  if (comp) enterFolderAdmin(comp)
})

init()
