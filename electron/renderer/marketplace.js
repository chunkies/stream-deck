'use strict'

let registry         = null
let installed        = []
let activeTab        = 'browse'
let activeTag        = ''
let searchQuery      = ''
let progressCallback = null   // single global slot — avoids listener leak

// ── Init ───────────────────────────────────────────────
async function init() {
  wireTabs()
  wireSearch()
  wireDevTab()
  wireInstalledTab()

  // Single progress listener registered once here
  window.mp.onProgress(d => { if (progressCallback) progressCallback(d) })

  // Load installed first (fast, local)
  installed = await window.mp.getInstalled()
  renderInstalled()
  updateInstalledCount()

  // Then fetch registry
  await loadRegistry()

  // Check updates in background
  const updates = await window.mp.checkUpdates()
  if (updates.length) markUpdates(updates)
}

// ── Registry ───────────────────────────────────────────
async function loadRegistry(force = false) {
  const status = document.getElementById('browse-status')
  status.style.display = 'block'
  status.textContent   = 'Loading registry…'
  try {
    registry = await window.mp.fetchRegistry(force)
    status.style.display = 'none'
    renderTagFilters()
    renderBrowse()
  } catch (err) {
    status.textContent = `Failed to load registry: ${err.message}`
  }
}

// ── Tags ───────────────────────────────────────────────
function renderTagFilters() {
  if (!registry?.plugins) return
  const tagSet = new Set()
  registry.plugins.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)))
  const container = document.getElementById('tag-filters')
  container.innerHTML = '<button class="mp-tag-btn active" data-tag="">All</button>'
  for (const tag of [...tagSet].sort()) {
    const btn = document.createElement('button')
    btn.className  = 'mp-tag-btn'
    btn.dataset.tag = tag
    btn.textContent = tag
    container.appendChild(btn)
  }
  container.querySelectorAll('.mp-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTag = btn.dataset.tag
      container.querySelectorAll('.mp-tag-btn').forEach(b => b.classList.toggle('active', b === btn))
      renderBrowse()
    })
  })
}

// ── Browse ─────────────────────────────────────────────
function renderBrowse() {
  const grid = document.getElementById('browse-grid')
  grid.innerHTML = ''
  if (!registry?.plugins) return

  const q    = searchQuery.toLowerCase()
  const list = registry.plugins.filter(p => {
    const matchTag    = !activeTag || (p.tags || []).includes(activeTag)
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.author || '').toLowerCase().includes(q)
    return matchTag && matchSearch
  })

  if (!list.length) {
    grid.innerHTML = '<div class="mp-empty">No plugins match your search.</div>'
    return
  }

  list.forEach(plugin => grid.appendChild(buildCard(plugin)))
}

function buildCard(plugin) {
  const isInstalled   = installed.some(i => i.id === plugin.id)
  const hasUpdate     = installed.some(i => i.id === plugin.id && i._updateAvailable)
  const isFree        = !plugin.price || plugin.price === 0
  const price         = isFree ? 'Free' : `$${(plugin.price / 100).toFixed(2)}`
  const hasDownload   = !!plugin.downloadUrl
  const hasPurchase   = !!plugin.purchaseUrl

  const card = document.createElement('div')
  card.className = 'mp-card'
  card.innerHTML = `
    <div class="mp-card-header">
      <div class="mp-card-icon">${plugin.icon ? `<img src="${esc(plugin.icon)}" onerror="this.style.display='none'">` : '🔌'}</div>
      <div class="mp-card-meta">
        <div class="mp-card-name">${esc(plugin.name)}</div>
        <div class="mp-card-author">by ${esc(plugin.author || 'Unknown')}</div>
      </div>
      <div class="mp-price-badge ${isFree ? 'free' : 'paid'}">${esc(price)}</div>
    </div>
    <div class="mp-card-desc">${esc(plugin.description || '')}</div>
    <div class="mp-card-tags">${(plugin.tags || []).map(t => `<span class="mp-tag">${esc(t)}</span>`).join('')}</div>
    <div class="mp-card-footer">
      ${plugin.homepage ? `<a href="#" class="mp-link mp-homepage" data-url="${esc(plugin.homepage)}">↗ Docs</a>` : '<span></span>'}
      <div class="mp-card-actions">
        ${hasUpdate && hasDownload ? `<button class="mp-install-btn update" data-action="install" data-id="${esc(plugin.id)}" data-url="${esc(plugin.downloadUrl)}">↑ Update</button>` : ''}
        ${isInstalled && !hasUpdate
          ? `<button class="mp-install-btn installed" disabled>✓ Installed</button>`
          : !isInstalled && isFree && hasDownload
            ? `<button class="mp-install-btn" data-action="install" data-id="${esc(plugin.id)}" data-url="${esc(plugin.downloadUrl)}">Install</button>`
            : !isInstalled && !isFree && hasPurchase
              ? `<button class="mp-install-btn paid" data-action="buy" data-url="${esc(plugin.purchaseUrl)}">Buy ${esc(price)} →</button>`
              : !isInstalled
                ? `<button class="mp-install-btn" disabled title="No download URL">Unavailable</button>`
                : ''
        }
      </div>
    </div>
  `

  // Wire action buttons — uses global progressCallback (no listener leak)
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.action === 'buy') {
        window.mp.openExternal(btn.dataset.url)
        return
      }

      const id  = btn.dataset.id
      const url = btn.dataset.url
      btn.disabled    = true
      btn.textContent = 'Downloading…'

      progressCallback = (d) => {
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
        progressCallback   = null
        btn.disabled       = false
        btn.textContent    = 'Install'
        showToast(`Install failed: ${err.message}`, 'error')
      }
    })
  })

  card.querySelectorAll('.mp-homepage[data-url]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); window.mp.openExternal(a.dataset.url) })
  })

  return card
}

// ── Installed ──────────────────────────────────────────
function renderInstalled() {
  const list = document.getElementById('installed-list')
  list.innerHTML = ''

  if (!installed.length) {
    list.innerHTML = '<div class="mp-empty">No plugins installed yet. Browse the marketplace to find some.</div>'
    return
  }

  installed.forEach(plugin => {
    const row = document.createElement('div')
    row.className  = 'mp-installed-row'
    row.dataset.id = plugin.id
    row.innerHTML  = `
      <div class="mp-installed-icon">${plugin.icon ? `<img src="${plugin.icon}" onerror="this.parentElement.textContent='🔌'">` : '🔌'}</div>
      <div class="mp-installed-info">
        <div class="mp-installed-name">${esc(plugin.name)} <span class="mp-ver">v${esc(plugin.version || '?')}</span>
          ${plugin._local ? '<span class="mp-local-badge">Local</span>' : ''}
        </div>
        <div class="mp-installed-author">${esc(plugin.author || '')}</div>
      </div>
      <div class="mp-installed-actions">
        ${plugin._updateAvailable ? `<button class="mp-btn-sm update" data-id="${esc(plugin.id)}" data-url="${esc(plugin._updateUrl || '')}">↑ Update</button>` : ''}
        <button class="mp-btn-sm danger" data-uninstall="${esc(plugin.id)}">Uninstall</button>
      </div>
    `

    row.querySelectorAll('[data-uninstall]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Uninstall "${plugin.name}"?`)) return
        await window.mp.uninstall(plugin.id)
        installed = await window.mp.getInstalled()
        renderInstalled()
        updateInstalledCount()
        if (registry) renderBrowse()
      })
    })

    row.querySelectorAll('.mp-btn-sm.update[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Updating…'
        try {
          await window.mp.install(btn.dataset.id, btn.dataset.url)
          installed = await window.mp.getInstalled()
          renderInstalled(); updateInstalledCount(); if (registry) renderBrowse()
        } catch (err) {
          btn.disabled = false; btn.textContent = '↑ Update'; alert(`Update failed: ${err.message}`)
        }
      })
    })

    list.appendChild(row)
  })
}

function markUpdates(updates) {
  updates.forEach(u => {
    const local = installed.find(i => i.id === u.id)
    if (local) { local._updateAvailable = true; local._updateUrl = u.downloadUrl }
  })
  renderInstalled()
  if (registry) renderBrowse()

  const status = document.getElementById('installed-status')
  status.style.display = 'block'
  status.textContent   = `${updates.length} update${updates.length > 1 ? 's' : ''} available`
  status.className     = 'mp-status update-notice'
}

function updateInstalledCount() {
  const el = document.getElementById('installed-count')
  el.textContent = installed.length ? installed.length : ''
}

// ── Tabs ───────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.mp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab
      document.querySelectorAll('.mp-tab').forEach(b => b.classList.toggle('active', b === btn))
      document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${activeTab}`))
    })
  })
}

// ── Search ─────────────────────────────────────────────
function wireSearch() {
  const input = document.getElementById('search')
  input.addEventListener('input', () => { searchQuery = input.value.trim(); renderBrowse() })
}

// ── Installed tab controls ─────────────────────────────
function wireInstalledTab() {
  document.getElementById('check-updates-btn').addEventListener('click', async () => {
    const btn = document.getElementById('check-updates-btn')
    btn.disabled = true; btn.textContent = 'Checking…'
    try {
      const updates = await window.mp.checkUpdates()
      btn.disabled = false; btn.textContent = 'Check for updates'
      if (!updates.length) {
        const s = document.getElementById('installed-status')
        s.style.display = 'block'; s.textContent = 'All plugins up to date'; s.className = 'mp-status'
      } else {
        markUpdates(updates)
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Check for updates'
      showToast(`Update check failed: ${err.message}`, 'error')
    }
  })

  document.getElementById('open-dir-btn').addEventListener('click', () => window.mp.openPluginsDir())
}

// ── Dev tab ────────────────────────────────────────────
function wireDevTab() {
  document.getElementById('load-local-btn').addEventListener('click', async () => {
    const status = document.getElementById('load-local-status')
    try {
      const manifest = await window.mp.loadLocal()
      if (!manifest) return
      status.textContent = `✓ Loaded "${manifest.name}" v${manifest.version}`
      status.style.color = '#4ade80'
      installed = await window.mp.getInstalled()
      renderInstalled(); updateInstalledCount()
    } catch (err) {
      status.textContent = `✗ ${err.message}`
      status.style.color = '#f87171'
    }
  })

  document.getElementById('registry-link').addEventListener('click', e => {
    e.preventDefault()
    window.mp.openExternal('https://github.com/chunkies/stream-deck/tree/master/registry')
  })
}

// ── Helpers ────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

let toastTimer = null
function showToast(msg, type = 'info') {
  let toast = document.getElementById('mp-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'mp-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.className   = `mp-toast ${type}`
  toast.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.style.opacity = '0' }, 3000)
}

init().catch(console.error)
