import type { ServerInfo, DeckEvent } from '../../shared/types'
import { state, adminPages } from './state'
import { pushConfig } from './state'
import { renderAll, renderGrid, enterFolderAdmin, closeRenameModal, saveRename, setAddPageHandler } from './grid'
import { closeModal, saveModal, deleteComp, showButtonActionFields, renderFolderPagesList } from './modal'
import { loadAndPopulatePlugins, wirePluginReload } from './plugins'
import { initAppearanceEditor } from './appearance'
import { wireImageUploads } from './images'
import { closePageModal, saveNewPage, openPageModal } from './pages'
import { setupCronUI, renderCronList } from './crons'
import { BUILTIN_ACTIONS } from './constants'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }


// ── Server info display ───────────────────────────────
function applyServerInfo(info: ServerInfo): void {
  const urlEl = el('server-url') as HTMLAnchorElement
  urlEl.textContent = info.url ?? ''
  urlEl.href        = info.url ?? ''
  ;(el('cert-url') as HTMLAnchorElement).href = `${info.url}/cert.crt`

  const qr = el('qr-img') as HTMLImageElement
  if (info.qr) { qr.src = info.qr; qr.style.display = 'block' }
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

// ── Update banner ─────────────────────────────────────
function setupUpdateBanner(): void {
  const banner  = el('update-banner')
  const msg     = el('update-banner-msg')
  const btn     = el('update-banner-btn')

  btn.addEventListener('click', () => window.api.installAppUpdate())

  window.api.onAppUpdateDownloaded((info) => {
    msg.textContent = `MacroPad v${info.version} is ready.`
    banner.style.display = 'flex'
  })
}

// ── About section (version + manual update check) ─────
function setupAboutSection(): void {
  const versionEl  = el('about-version')
  const statusEl   = el('about-update-status')
  const checkBtn   = el('about-check-btn')
  const restartBtn = el('about-restart-btn')

  window.api.getAppVersion().then(v => { versionEl.textContent = `v${v}` })

  checkBtn.addEventListener('click', async () => {
    checkBtn.textContent = 'Checking…'
    checkBtn.setAttribute('disabled', '')
    const info = await window.api.checkAppUpdate()
    checkBtn.removeAttribute('disabled')
    checkBtn.textContent = 'Check for updates'
    if (info) {
      statusEl.textContent = `v${info.version} available — downloading…`
    } else {
      statusEl.textContent = 'Up to date'
    }
  })

  restartBtn.addEventListener('click', () => window.api.installAppUpdate())

  window.api.onAppUpdateAvailable((info) => {
    statusEl.textContent = `v${info.version} available — downloading…`
  })

  window.api.onAppUpdateDownloaded((info) => {
    statusEl.textContent = `v${info.version} ready to install`
    restartBtn.style.display = ''
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

  if (state.serverInfo?.url) applyServerInfo(state.serverInfo)

  window.api.onServerReady((info: ServerInfo) => {
    state.serverInfo = info
    applyServerInfo(info)
    renderGrid()
  })

  setupUpdateBanner()
  setupAboutSection()
  await setupWebhookSettings()
  await setupLicenseUI()
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

setAddPageHandler(openPageModal)
el('empty-add-page-btn').addEventListener('click', openPageModal)


el('page-modal-close').addEventListener('click', closePageModal)
el('page-modal-save').addEventListener('click', saveNewPage)
el('page-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closePageModal() })
el('f-page-name').addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') saveNewPage() })

el('autostart-toggle').addEventListener('change', e => {
  window.api.setAutostart((e.target as HTMLInputElement).checked)
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


// ── Settings overlay ──────────────────────────────────
el('settings-open-btn').addEventListener('click', () => {
  el('settings-overlay').style.display = 'flex'
})
el('settings-close-btn').addEventListener('click', () => {
  el('settings-overlay').style.display = 'none'
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && el('settings-overlay').style.display !== 'none') {
    el('settings-overlay').style.display = 'none'
  }
})
document.querySelectorAll<HTMLElement>('.settings-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset['section']
    document.querySelectorAll<HTMLElement>('.settings-nav-item').forEach(i => i.classList.remove('active'))
    document.querySelectorAll<HTMLElement>('.settings-section').forEach(s => s.classList.remove('active'))
    item.classList.add('active')
    el(`ssec-${section}`).classList.add('active')
  })
})

init().catch(console.error)
