import type { PluginManifest, PluginRegistry, RegistryPlugin, UpdateInfo, ProgressData } from '../../shared/types'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }

let registry:         PluginRegistry | null = null
let installed:        PluginManifest[]      = []
let activeTab:        string                = 'browse'
let activeTag:        string                = ''
let searchQuery:      string                = ''
let progressCallback: ((d: ProgressData) => void) | null = null

// ── Init ───────────────────────────────────────────────
async function init(): Promise<void> {
  wireTabs()
  wireSearch()
  wireDevTab()
  wireInstalledTab()

  window.mp.onProgress(d => { if (progressCallback) progressCallback(d) })

  installed = await window.mp.getInstalled()
  renderInstalled()
  updateInstalledCount()

  await loadRegistry()

  const updates = await window.mp.checkUpdates()
  if (updates.length) markUpdates(updates)
}

// ── Registry ───────────────────────────────────────────
async function loadRegistry(force = false): Promise<void> {
  const status = el('browse-status')
  status.style.display = 'block'
  status.textContent   = 'Loading registry…'
  try {
    registry = await window.mp.fetchRegistry(force)
    status.style.display = 'none'
    renderTagFilters()
    renderBrowse()
  } catch (err) {
    status.textContent = `Failed to load registry: ${(err as Error).message}`
  }
}

// ── Tags ───────────────────────────────────────────────
function renderTagFilters(): void {
  if (!registry?.plugins) return
  const tagSet = new Set<string>()
  registry.plugins.forEach(p => (p.tags ?? []).forEach(t => tagSet.add(t)))
  const container = el('tag-filters')
  container.innerHTML = '<button class="mp-tag-btn active" data-tag="">All</button>'
  for (const tag of [...tagSet].sort()) {
    const btn = document.createElement('button')
    btn.className    = 'mp-tag-btn'
    btn.dataset['tag'] = tag
    btn.textContent  = tag
    container.appendChild(btn)
  }
  container.querySelectorAll<HTMLElement>('.mp-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTag = btn.dataset['tag'] ?? ''
      container.querySelectorAll<HTMLElement>('.mp-tag-btn').forEach(b => b.classList.toggle('active', b === btn))
      renderBrowse()
    })
  })
}

// ── Browse ─────────────────────────────────────────────
function renderBrowse(): void {
  const grid = el('browse-grid')
  grid.innerHTML = ''
  if (!registry?.plugins) return

  const q    = searchQuery.toLowerCase()
  const list = registry.plugins.filter(p => {
    const matchTag    = !activeTag || (p.tags ?? []).includes(activeTag)
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q)
    return matchTag && matchSearch
  })

  if (!list.length) {
    grid.innerHTML = '<div class="mp-empty">No plugins match your search.</div>'
    return
  }

  list.forEach(plugin => grid.appendChild(buildCard(plugin)))
}

function buildCard(plugin: RegistryPlugin): HTMLElement {
  const isInstalled = installed.some(i => i.id === plugin.id)
  const hasUpdate   = installed.some(i => i.id === plugin.id && i._updateAvailable)
  const isFree      = !plugin.price || plugin.price === 0
  const price       = isFree ? 'Free' : `$${((plugin.price ?? 0) / 100).toFixed(2)}`
  const hasDownload = !!plugin.downloadUrl
  const hasPurchase = !!plugin.purchaseUrl

  const card = document.createElement('div')
  card.className = 'mp-card'
  card.innerHTML = `
    <div class="mp-card-header">
      <div class="mp-card-icon">${plugin.icon ? `<img src="${esc(plugin.icon)}" class="mp-icon-img">` : '🔌'}</div>
      <div class="mp-card-meta">
        <div class="mp-card-name">${esc(plugin.name)}</div>
        <div class="mp-card-author">by ${esc(plugin.author ?? 'Unknown')}</div>
      </div>
      <div class="mp-price-badge ${isFree ? 'free' : 'paid'}">${esc(price)}</div>
    </div>
    <div class="mp-card-desc">${esc(plugin.description ?? '')}</div>
    <div class="mp-card-tags">${(plugin.tags ?? []).map(t => `<span class="mp-tag">${esc(t)}</span>`).join('')}</div>
    <div class="mp-card-footer">
      ${plugin.homepage ? `<a href="#" class="mp-link mp-homepage" data-url="${esc(plugin.homepage)}">↗ Docs</a>` : '<span></span>'}
      <div class="mp-card-actions">
        ${hasUpdate && hasDownload ? `<button class="mp-install-btn update" data-action="install" data-id="${esc(plugin.id)}" data-url="${esc(plugin.downloadUrl ?? '')}">↑ Update</button>` : ''}
        ${isInstalled && !hasUpdate
          ? `<button class="mp-install-btn installed" disabled>✓ Installed</button>`
          : !isInstalled && isFree && hasDownload
            ? `<button class="mp-install-btn" data-action="install" data-id="${esc(plugin.id)}" data-url="${esc(plugin.downloadUrl ?? '')}">Install</button>`
            : !isInstalled && !isFree && hasPurchase
              ? `<button class="mp-install-btn paid" data-action="buy" data-url="${esc(plugin.purchaseUrl ?? '')}">Buy ${esc(price)} →</button>`
              : !isInstalled
                ? `<button class="mp-install-btn" disabled title="No download URL">Unavailable</button>`
                : ''
        }
      </div>
    </div>
  `

  card.querySelector<HTMLElement>('.mp-icon-img')?.addEventListener('error', (e) => {
    ;(e.target as HTMLElement).style.display = 'none'
  })

  card.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset['action'] === 'buy') {
        window.mp.openExternal(btn.dataset['url'] ?? '')
        return
      }

      const id  = btn.dataset['id']  ?? ''
      const url = btn.dataset['url'] ?? ''
      btn.disabled    = true
      btn.textContent = 'Downloading…'

      progressCallback = (d: ProgressData) => {
        if (d.status === 'downloading') btn.textContent = `${d.pct}%`
        if (d.status === 'extracting') btn.textContent = 'Installing…'
      }

      try {
        await window.mp.install(id, url)
        progressCallback = null
        installed = await window.mp.getInstalled()
        renderInstalled()
        updateInstalledCount()
        renderBrowse()
      } catch (err) {
        progressCallback = null
        btn.disabled     = false
        btn.textContent  = 'Install'
        showToast(`Install failed: ${(err as Error).message}`, 'error')
      }
    })
  })

  card.querySelectorAll<HTMLElement>('.mp-homepage[data-url]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); window.mp.openExternal(a.dataset['url'] ?? '') })
  })

  return card
}

// ── Installed ──────────────────────────────────────────
function renderInstalled(): void {
  const list = el('installed-list')
  list.innerHTML = ''

  if (!installed.length) {
    list.innerHTML = '<div class="mp-empty">No plugins installed yet. Browse the marketplace to find some.</div>'
    return
  }

  installed.forEach(plugin => {
    const row = document.createElement('div')
    row.className  = 'mp-installed-row'
    row.dataset['id'] = plugin.id
    row.innerHTML  = `
      <div class="mp-installed-icon">${plugin.icon ? `<img src="${esc(plugin.icon)}" onerror="this.parentElement.textContent='🔌'">` : '🔌'}</div>
      <div class="mp-installed-info">
        <div class="mp-installed-name">${esc(plugin.name ?? '')} <span class="mp-ver">v${esc(plugin.version ?? '?')}</span>
          ${plugin._local ? '<span class="mp-local-badge">Local</span>' : ''}
        </div>
        <div class="mp-installed-author">${esc(plugin.author ?? '')}</div>
      </div>
      <div class="mp-installed-actions">
        ${plugin._updateAvailable ? `<button class="mp-btn-sm update" data-id="${esc(plugin.id)}" data-url="${esc(plugin._updateUrl ?? '')}">↑ Update</button>` : ''}
        <button class="mp-btn-sm danger" data-uninstall="${esc(plugin.id)}">Uninstall</button>
      </div>
    `

    row.querySelectorAll<HTMLButtonElement>('[data-uninstall]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Uninstall "${plugin.name ?? plugin.id}"?`)) return
        await window.mp.uninstall(plugin.id)
        installed = await window.mp.getInstalled()
        renderInstalled()
        updateInstalledCount()
        if (registry) renderBrowse()
      })
    })

    row.querySelectorAll<HTMLButtonElement>('.mp-btn-sm.update[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Updating…'
        try {
          await window.mp.install(btn.dataset['id'] ?? '', btn.dataset['url'] ?? '')
          installed = await window.mp.getInstalled()
          renderInstalled(); updateInstalledCount(); if (registry) renderBrowse()
        } catch (err) {
          btn.disabled = false; btn.textContent = '↑ Update'
          alert(`Update failed: ${(err as Error).message}`)
        }
      })
    })

    list.appendChild(row)
  })
}

function markUpdates(updates: UpdateInfo[]): void {
  updates.forEach(u => {
    const local = installed.find(i => i.id === u.id)
    if (local) { local._updateAvailable = true; local._updateUrl = u.downloadUrl }
  })
  renderInstalled()
  if (registry) renderBrowse()

  const status = el('installed-status')
  status.style.display = 'block'
  status.textContent   = `${updates.length} update${updates.length > 1 ? 's' : ''} available`
  status.className     = 'mp-status update-notice'
}

function updateInstalledCount(): void {
  const countEl = el('installed-count')
  countEl.textContent = installed.length ? String(installed.length) : ''
}

// ── Tabs ───────────────────────────────────────────────
function wireTabs(): void {
  document.querySelectorAll<HTMLElement>('.mp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset['tab'] ?? ''
      document.querySelectorAll<HTMLElement>('.mp-tab').forEach(b => b.classList.toggle('active', b === btn))
      document.querySelectorAll<HTMLElement>('.mp-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${activeTab}`))
    })
  })
}

// ── Search ─────────────────────────────────────────────
function wireSearch(): void {
  const searchInput = el('search') as HTMLInputElement
  searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim(); renderBrowse() })
}

// ── Installed tab controls ─────────────────────────────
function wireInstalledTab(): void {
  const checkBtn = el('check-updates-btn') as HTMLButtonElement
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true; checkBtn.textContent = 'Checking…'
    try {
      const updates = await window.mp.checkUpdates()
      checkBtn.disabled = false; checkBtn.textContent = 'Check for updates'
      if (!updates.length) {
        const s = el('installed-status')
        s.style.display = 'block'; s.textContent = 'All plugins up to date'; s.className = 'mp-status'
      } else {
        markUpdates(updates)
      }
    } catch (err) {
      checkBtn.disabled = false; checkBtn.textContent = 'Check for updates'
      showToast(`Update check failed: ${(err as Error).message}`, 'error')
    }
  })

  el('open-dir-btn').addEventListener('click', () => window.mp.openPluginsDir())
}

// ── Dev tab ────────────────────────────────────────────
function wireDevTab(): void {
  el('load-local-btn').addEventListener('click', async () => {
    const status = el('load-local-status')
    try {
      const manifest = await window.mp.loadLocal()
      if (!manifest) return
      status.textContent = `✓ Loaded "${manifest.name}" v${manifest.version}`
      status.style.color = '#4ade80'
      installed = await window.mp.getInstalled()
      renderInstalled(); updateInstalledCount()
    } catch (err) {
      status.textContent = `✗ ${(err as Error).message}`
      status.style.color = '#f87171'
    }
  })

  el('registry-link').addEventListener('click', e => {
    e.preventDefault()
    window.mp.openExternal('https://github.com/chunkies/macropad/tree/master/registry')
  })
}

// ── Helpers ────────────────────────────────────────────
function esc(str: string): string {
  const div = document.createElement('div')
  div.textContent = String(str || '')
  return div.innerHTML
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, type = 'info'): void {
  let toast = document.getElementById('mp-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'mp-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.className   = `mp-toast ${type}`
  toast.style.opacity = '1'
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast!.style.opacity = '0' }, 3000)
}

init().catch(console.error)
