// @ts-nocheck
// Note: circular imports with modal.ts and components.ts are intentional —
// openModal / createComponentAtCell are only called inside function bodies, never at module init.
import { state, adminPages, adminIdx, setAdminIdx } from './state'
import { pushConfig } from './config'
import { openModal } from './modal'
import { createComponentAtCell } from './components'

export function renderAll() { renderTabs(); renderGrid() }

// ── Tabs / page navigation ─────────────────────────────
export function renderTabs() {
  const pages = adminPages()
  const idx   = adminIdx()
  const tabs  = document.getElementById('page-tabs')
  tabs.innerHTML = ''

  if (state.adminFolderStack.length) {
    const bc = document.createElement('div')
    bc.className = 'folder-breadcrumb'
    const crumbs = state.adminFolderStack.map(f => f.folderComp.label || 'Folder').join(' › ')
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

// ── Rename modal ───────────────────────────────────────
export function openRenameModal(pageIdx) {
  state.renamingPageIdx = pageIdx
  document.getElementById('f-rename-name').value = adminPages()[pageIdx].name
  document.getElementById('rename-modal').style.display = 'flex'
  setTimeout(() => document.getElementById('f-rename-name').select(), 50)
}

export function closeRenameModal() {
  document.getElementById('rename-modal').style.display = 'none'
  state.renamingPageIdx = null
}

export function saveRename() {
  if (state.renamingPageIdx === null) return
  const name = document.getElementById('f-rename-name').value.trim()
  if (!name) return
  adminPages()[state.renamingPageIdx].name = name
  pushConfig(); renderTabs()
  closeRenameModal()
}

// ── Folder navigation ──────────────────────────────────
export function enterFolderAdmin(folderComp) {
  if (!folderComp.pages?.length) { alert('Add at least one sub-page first.'); return }
  import('./modal').then(m => m.closeModal())
  state.adminFolderStack.push({ folderComp, pageIdx: 0 })
  renderAll()
}

export function exitFolderAdmin() {
  state.adminFolderStack.pop()
  renderAll()
}

// ── Grid helpers ───────────────────────────────────────
export function ptrToCell(e, gridEl, cols, rows) {
  const r = gridEl.getBoundingClientRect()
  return {
    col: Math.max(1, Math.min(cols, Math.ceil((e.clientX - r.left) / r.width  * cols))),
    row: Math.max(1, Math.min(rows, Math.ceil((e.clientY - r.top)  / r.height * rows)))
  }
}

// ── Grid rendering ─────────────────────────────────────
export function renderGrid() {
  const gridEl = document.getElementById('grid')
  const page   = adminPages()[adminIdx()]
  const cols   = page.cols || state.config.grid.cols
  const rows   = state.config.grid.rows
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
    if (comp.image && state.serverInfo) {
      card.style.backgroundImage    = `url(https://${state.serverInfo.ip}:${state.serverInfo.port}${comp.image})`
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

      default: // button
        card.innerHTML = `
          <div class="cell-icon">${comp.icon || ''}</div>
          <div class="cell-label">${comp.label || ''}</div>
          ${comp.holdAction ? '<div class="cell-hold-badge">⟳</div>' : ''}
          <div class="resize-handle"></div>`
    }

    // Resize handle — drag bottom-right corner
    const handle = card.querySelector('.resize-handle')
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)

      function onMove(e) {
        const cell   = ptrToCell(e, gridEl, cols, rows)
        comp.colSpan = Math.max(1, Math.min(cols - comp.col + 1, cell.col - comp.col + 1))
        comp.rowSpan = Math.max(1, Math.min(rows - comp.row + 1, cell.row - comp.row + 1))
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

    // Drag to move (card body) — short drag threshold distinguishes from click
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
