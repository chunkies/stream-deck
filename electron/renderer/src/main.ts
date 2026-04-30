import type { ServerInfo, DeckEvent } from '../../shared/types'
import { state, adminPages } from './state'
import { pushConfig } from './config'
import { renderAll, renderGrid, enterFolderAdmin, closeRenameModal, saveRename } from './grid'
import { closeModal, saveModal, deleteComp, showButtonActionFields, renderFolderPagesList } from './modal'
import { loadAndPopulatePlugins, wirePluginReload } from './plugins'
import { initAppearanceEditor } from './appearance'
import { wireImageUploads } from './images'
import { closePageModal, saveNewPage, openPageModal } from './pages'
import { setupCronUI, renderCronList } from './crons'
import { BUILTIN_ACTIONS } from './constants'
import { openTemplateStore, closeTemplateStore } from './templates'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }

// ── Server info display ───────────────────────────────
function applyServerInfo(info: ServerInfo): void {
  const urlEl = el('server-url') as HTMLAnchorElement
  urlEl.textContent = info.url ?? ''
  urlEl.href        = info.url ?? ''
  ;(el('cert-url') as HTMLAnchorElement).href = `${info.url}/cert.crt`

  const qr = el('qr-img') as HTMLImageElement
  if (info.qr) { qr.src = info.qr; qr.style.display = 'block' }

  const toggle = document.getElementById('cert-setup-toggle')
  const body   = document.getElementById('cert-setup-body')
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none'
      body.style.display = open ? 'none' : ''
      toggle.textContent = open ? '📱 First time? Phone setup ▾' : '📱 First time? Phone setup ▴'
    })
    document.querySelectorAll<HTMLElement>('.cert-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const os = (e.currentTarget as HTMLElement).dataset['os']
        document.querySelectorAll<HTMLElement>('.cert-tab').forEach(b => b.classList.remove('active'))
        ;(e.currentTarget as HTMLElement).classList.add('active')
        el('cert-steps-ios').style.display     = os === 'ios'     ? '' : 'none'
        el('cert-steps-android').style.display = os === 'android' ? '' : 'none'
      })
    })
  }
}

// ── Builtin action selects ────────────────────────────
function populateBuiltinSelect(): void {
  for (const selId of ['f-builtin-key', 't-builtin-key', 's-builtin-key', 'k-builtin-key']) {
    const selEl = document.getElementById(selId) as HTMLSelectElement | null
    if (!selEl) continue
    selEl.innerHTML = ''
    let lastGroup = ''
    for (const { group, key, label } of BUILTIN_ACTIONS) {
      if (group !== lastGroup) {
        const og = document.createElement('optgroup'); og.label = group; selEl.appendChild(og)
        lastGroup = group
      }
      const opt = document.createElement('option'); opt.value = key; opt.textContent = label; selEl.appendChild(opt)
    }
  }
}

// ── Update notifications ───────────────────────────────
function setupUpdateNotifications(): void {
  const banner = document.createElement('div')
  banner.id = 'update-banner'
  Object.assign(banner.style, {
    display: 'none', position: 'fixed', bottom: '12px', right: '12px',
    background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
    padding: '10px 14px', fontSize: '13px', color: '#e2e8f0',
    zIndex: '9999', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', maxWidth: '280px',
  })
  document.body.appendChild(banner)

  window.api.onAppUpdateAvailable((info) => {
    banner.textContent = `Update v${info.version} available — downloading…`
    banner.style.display = 'block'
  })

  window.api.onAppUpdateDownloaded((info) => {
    banner.innerHTML = ''
    const msg = document.createElement('span')
    msg.textContent = `v${info.version} ready — `
    const btn = document.createElement('button')
    btn.textContent = 'Restart to install'
    Object.assign(btn.style, {
      background: '#6366f1', color: 'white', border: 'none',
      borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px',
    })
    btn.addEventListener('click', () => window.api.installAppUpdate())
    banner.appendChild(msg)
    banner.appendChild(btn)
    banner.style.display = 'block'
  })
}

// ── Webhook settings ──────────────────────────────────
async function setupWebhookSettings(): Promise<void> {
  const info = await window.api.getWebhookInfo()
  if (!info) return
  const toggle   = el('webhook-toggle') as HTMLInputElement
  const urlRow   = el('webhook-url-row')
  const urlInput = el('webhook-url-input') as HTMLInputElement
  const copyBtn  = el('webhook-copy-btn')

  const baseUrl  = state.serverInfo?.url ?? ''

  function updateWebhookUrl(enabled: boolean): void {
    urlRow.style.display = enabled ? '' : 'none'
    if (enabled) {
      urlInput.value = `${baseUrl}/webhook/${info!.secret}/:pageId/:buttonId`
    }
  }

  toggle.checked = info.enabled
  updateWebhookUrl(info.enabled)

  toggle.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked
    await window.api.setWebhookEnabled(enabled)
    updateWebhookUrl(enabled)
  })

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(urlInput.value).catch(() => { /* clipboard may be blocked */ })
    copyBtn.textContent = 'Copied!'
    setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
  })
}

// ── License UI ────────────────────────────────────────
async function setupLicenseUI(): Promise<void> {
  const status      = await window.api.getLicenseStatus()
  const badge       = el('license-badge')
  const activateRow = el('license-activate-row')
  const keyInput    = el('license-key-input') as HTMLInputElement
  const activateBtn = el('license-activate-btn')
  const errorEl     = el('license-error')

  function applyStatus(isPro: boolean, key: string | null): void {
    if (isPro && key) {
      const masked = `${key.slice(0, 8)}...${key.slice(-8)}`
      badge.textContent = `Pro (key: ${masked})`
      badge.className   = 'badge connected'
      activateRow.style.display = 'none'
    } else {
      badge.textContent = 'Free'
      badge.className   = 'badge disconnected'
      activateRow.style.display = ''
    }
  }

  applyStatus(status.isPro, status.key)

  activateBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim()
    errorEl.style.display = 'none'
    const ok = await window.api.validateLicense(key)
    if (ok) {
      applyStatus(true, key)
    } else {
      errorEl.style.display = ''
    }
  })
}

// ── Custom CSS ────────────────────────────────────────
function setupCustomCss(): void {
  const textarea = el('custom-css-input') as HTMLTextAreaElement
  const applyBtn = el('custom-css-apply-btn')
  // Pre-populate from saved config
  textarea.value = state.config?.customCSS ?? ''
  applyBtn.addEventListener('click', () => {
    if (!state.config) return
    state.config.customCSS = textarea.value
    pushConfig()
  })
}

// ── Init ──────────────────────────────────────────────
async function init(): Promise<void> {
  ;[state.config, state.serverInfo] = await Promise.all([
    window.api.getConfig(),
    window.api.getServerInfo(),
  ])

  populateBuiltinSelect()
  wireImageUploads()
  wirePluginReload()
  initAppearanceEditor()
  await loadAndPopulatePlugins()
  renderAll()

  const autostart = await window.api.getAutostart()
  ;(el('autostart-toggle') as HTMLInputElement).checked = autostart

  ;(el('grid-cols') as HTMLInputElement).value = String(state.config!.grid.cols)
  ;(el('grid-rows') as HTMLInputElement).value = String(state.config!.grid.rows)

  if (state.serverInfo?.url) applyServerInfo(state.serverInfo)

  window.api.onServerReady((info: ServerInfo) => {
    state.serverInfo = info
    applyServerInfo(info)
    renderGrid()
  })

  setupUpdateNotifications()
  await setupWebhookSettings()
  await setupLicenseUI()
  setupCustomCss()
  setupCronUI()
  renderCronList()

  window.api.onDeckEvent((event: DeckEvent) => {
    if (event.type === 'connection') {
      const statusEl = el('phone-status')
      statusEl.textContent = event.connected ? `Connected (${event.clients})` : 'Disconnected'
      statusEl.className   = 'badge ' + (event.connected ? 'connected' : 'disconnected')
    }
    if (event.type === 'press' || event.type === 'slide') {
      const page = state.config?.pages.find(p => p.id === event.pageId)
      const comp = page?.components?.find(c => c.id === event.compId)
      if (comp) {
        const val = event.type === 'slide' ? ` → ${Math.round(event.value)}` : ''
        el('last-press').textContent = `${comp.icon || comp.label || '?'}${val}`
      }
    }
  })
}

// ── Event wiring ──────────────────────────────────────
el('f-action-type').addEventListener('change', e => showButtonActionFields((e.target as HTMLSelectElement).value))
el('f-hold-enable').addEventListener('change', e => {
  el('hold-fields').style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none'
})
el('drawer-close').addEventListener('click', closeModal)
el('modal-save').addEventListener('click', saveModal)
el('modal-delete').addEventListener('click', deleteComp)

el('add-page-btn').addEventListener('click', openPageModal)
el('marketplace-btn').addEventListener('click', () => window.api.openMarketplace())
el('templates-btn').addEventListener('click', openTemplateStore)
el('template-store-close').addEventListener('click', closeTemplateStore)
el('page-modal-close').addEventListener('click', closePageModal)
el('page-modal-save').addEventListener('click', saveNewPage)
el('page-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePageModal() })
el('f-page-name').addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') saveNewPage() })

el('autostart-toggle').addEventListener('change', e => {
  window.api.setAutostart((e.target as HTMLInputElement).checked)
})

el('grid-save-btn').addEventListener('click', () => {
  const cols = parseInt((el('grid-cols') as HTMLInputElement).value)
  const rows = parseInt((el('grid-rows') as HTMLInputElement).value)
  if (!cols || !rows || cols < 1 || rows < 1) return
  state.config!.grid.cols = cols
  state.config!.grid.rows = rows
  pushConfig(); renderAll()
})

el('export-btn').addEventListener('click', async () => {
  await window.api.exportConfig()
})

el('import-btn').addEventListener('click', async () => {
  const result = await window.api.importConfig()
  if (!result.ok) {
    if (result.error) alert(result.error)
    return
  }
  state.config = result.config!
  ;(el('grid-cols') as HTMLInputElement).value = String(state.config.grid.cols)
  ;(el('grid-rows') as HTMLInputElement).value = String(state.config.grid.rows)
  state.currentPageIdx   = 0
  state.adminFolderStack = []
  closeModal()
  renderAll()
})

el('rename-modal-close').addEventListener('click', closeRenameModal)
el('rename-modal').addEventListener('click', e => {
  if (e.target === el('rename-modal')) closeRenameModal()
})
el('rename-modal-save').addEventListener('click', saveRename)
el('f-rename-name').addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') saveRename() })

el('folder-add-page-btn').addEventListener('click', () => {
  if (!state.editingComp) return
  const { pageIdx, compId } = state.editingComp
  const comp = adminPages()[pageIdx].components.find(c => c.id === compId)
  if (!comp) return
  if (!comp.pages) comp.pages = []
  const name = prompt('Sub-page name:', `Page ${comp.pages.length + 1}`)
  if (!name?.trim()) return
  comp.pages.push({ id: `fp-${Date.now()}`, name: name.trim(), components: [] })
  pushConfig()
  renderFolderPagesList(comp, pageIdx, compId ?? '')
  renderGrid()
})

el('folder-edit-btn').addEventListener('click', () => {
  if (!state.editingComp) return
  const { pageIdx, compId } = state.editingComp
  const comp = adminPages()[pageIdx].components.find(c => c.id === compId)
  if (comp) enterFolderAdmin(comp)
})

init().catch(console.error)
