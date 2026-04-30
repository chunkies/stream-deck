// Note: circular imports with modal.ts and components.ts are intentional —
// openModal / createComponentAtCell are only called inside function bodies, never at module init.
import type { Component, ComponentType } from '../../shared/types'
import { state, adminPages, adminIdx, setAdminIdx } from './state'
import { pushConfig } from './config'
import { openModal, closeModal } from './modal'
import { createComponentAtCell } from './components'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }

let _onAddPage: (() => void) | null = null
export function setAddPageHandler(fn: () => void): void { _onAddPage = fn }


export function renderAll(): void {
  const pages = adminPages()
  const emptyState = document.getElementById('empty-state')
  const gridEl     = document.getElementById('grid')
  if (emptyState) emptyState.style.display = pages.length === 0 ? 'flex' : 'none'
  if (gridEl)     gridEl.style.display     = pages.length === 0 ? 'none' : ''
  renderTabs()
  if (pages.length > 0) renderGrid()
}

// ── Tabs / page navigation ─────────────────────────────
export function renderTabs(): void {
  const pages = adminPages()
  const idx   = adminIdx()
  const tabs  = el('page-tabs')
  tabs.innerHTML = ''

  if (state.adminFolderStack.length) {
    const bc = document.createElement('div')
    bc.className = 'folder-breadcrumb'
    const crumbs = state.adminFolderStack.map(f => f.folderComp.label || 'Folder').join(' › ')
    bc.innerHTML = '<button class="folder-back-btn" id="folder-back-btn">← Back</button><span class="folder-crumb"></span>'
    bc.querySelector<HTMLElement>('.folder-crumb')!.textContent = `📁 ${crumbs}`
    bc.querySelector<HTMLElement>('#folder-back-btn')!.addEventListener('click', exitFolderAdmin)
    tabs.appendChild(bc)
  }

  pages.forEach((page, i) => {
    const tab = document.createElement('div')
    tab.className = 'tab' + (i === idx ? ' active' : '')
    tab.innerHTML = `<span class="tab-name"></span><button class="tab-cfg" data-i="${i}">⚙</button>${pages.length > 1 ? `<button class="tab-del" data-i="${i}">✕</button>` : ''}`
    tab.querySelector<HTMLElement>('.tab-name')!.textContent = page.name
    tab.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('tab-del')) { setAdminIdx(i); renderAll() }
    })
    tab.querySelector<HTMLElement>('.tab-name')!.addEventListener('dblclick', (e) => { e.stopPropagation(); openRenameModal(i) })
    tabs.appendChild(tab)
  })

  tabs.querySelectorAll<HTMLElement>('.tab-cfg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openRenameModal(parseInt(btn.dataset['i'] ?? '0'))
    })
  })

  tabs.querySelectorAll<HTMLElement>('.tab-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset['i'] ?? '0')
      const ps = adminPages()
      if (!confirm(`Delete page "${ps[i].name}"?`)) return
      ps.splice(i, 1)
      if (adminIdx() >= ps.length) setAdminIdx(ps.length - 1)
      pushConfig(); renderAll()
    })
  })

  if (!state.adminFolderStack.length && _onAddPage) {
    const addBtn = document.createElement('button')
    addBtn.id        = 'add-page-btn'
    addBtn.className = 'tab-add'
    addBtn.textContent = '+'
    addBtn.addEventListener('click', () => _onAddPage!())
    tabs.appendChild(addBtn)
  }
}

// ── Rename modal ───────────────────────────────────────
export function openRenameModal(pageIdx: number): void {
  state.renamingPageIdx = pageIdx
  const page = adminPages()[pageIdx]
  ;(el('f-rename-name') as HTMLInputElement).value  = page.name
  ;(el('f-rename-cols') as HTMLInputElement).value  = page.cols != null ? String(page.cols) : ''
  ;(el('f-rename-rows') as HTMLInputElement).value  = page.rows != null ? String(page.rows) : ''
  ;(el('f-auto-class') as HTMLInputElement).value   = page.autoProfile?.windowClass ?? ''
  ;(el('f-auto-title') as HTMLInputElement).value   = page.autoProfile?.windowTitle ?? ''
  el('rename-modal').style.display = 'flex'
  setTimeout(() => (el('f-rename-name') as HTMLInputElement).select(), 50)
}

export function closeRenameModal(): void {
  el('rename-modal').style.display = 'none'
  state.renamingPageIdx = null
}

export function saveRename(): void {
  if (state.renamingPageIdx === null) return
  const name   = (el('f-rename-name') as HTMLInputElement).value.trim()
  if (!name) return
  const page   = adminPages()[state.renamingPageIdx]
  page.name    = name
  const colsStr = (el('f-rename-cols') as HTMLInputElement).value.trim()
  const cols = parseInt(colsStr)
  if (colsStr === '' || isNaN(cols)) { delete page.cols } else if (cols >= 1 && cols <= 8) { page.cols = cols }
  const rowsStr = (el('f-rename-rows') as HTMLInputElement).value.trim()
  const rows = parseInt(rowsStr)
  if (rowsStr === '' || isNaN(rows)) { delete page.rows } else if (rows >= 1 && rows <= 8) { page.rows = rows }
  const wclass = (el('f-auto-class') as HTMLInputElement).value.trim()
  const wtitle = (el('f-auto-title') as HTMLInputElement).value.trim()
  if (wclass || wtitle) {
    page.autoProfile = {}
    if (wclass) page.autoProfile.windowClass = wclass
    if (wtitle) page.autoProfile.windowTitle = wtitle
  } else {
    delete page.autoProfile
  }
  pushConfig(); renderAll()
  closeRenameModal()
}

// ── Folder navigation ──────────────────────────────────
export function enterFolderAdmin(folderComp: Component): void {
  if (!folderComp.pages?.length) { alert('Add at least one sub-page first.'); return }
  closeModal()
  state.adminFolderStack.push({ folderComp, pageIdx: 0 })
  renderAll()
}

export function exitFolderAdmin(): void {
  state.adminFolderStack.pop()
  renderAll()
}

// ── Grid helpers ───────────────────────────────────────
export function ptrToCell(e: PointerEvent, gridEl: HTMLElement, cols: number, rows: number): { col: number; row: number } {
  const r = gridEl.getBoundingClientRect()
  return {
    col: Math.max(1, Math.min(cols, Math.ceil((e.clientX - r.left) / r.width  * cols))),
    row: Math.max(1, Math.min(rows, Math.ceil((e.clientY - r.top)  / r.height * rows))),
  }
}

// ── Grid rendering ─────────────────────────────────────
export function renderGrid(): void {
  const gridEl = el('grid')
  const page   = adminPages()[adminIdx()]
  const cols   = page.cols || state.config!.grid.cols
  const rows   = page.rows || state.config!.grid.rows
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  gridEl.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  gridEl.innerHTML = ''

  // Ghost cells — background grid, drop targets for dragged components
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const ghost = document.createElement('div')
      ghost.className        = 'ghost-cell'
      ghost.style.gridColumn = String(c)
      ghost.style.gridRow    = String(r)
      ghost.addEventListener('dragover',  (e: DragEvent) => { e.preventDefault(); ghost.classList.add('drag-over') })
      ghost.addEventListener('dragleave', () => ghost.classList.remove('drag-over'))
      ghost.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault()
        ghost.classList.remove('drag-over')
        if (!e.dataTransfer) return
        let data: { compType: ComponentType; pluginKey: string | null; label: string; options: Partial<Component> }
        try { data = JSON.parse(e.dataTransfer.getData('application/json')) } catch { return }
        createComponentAtCell(data.compType, data.pluginKey, data.label, c, r, data.options ?? {})
      })
      gridEl.appendChild(ghost)
    }
  }

  // Component cards — placed on top of ghost cells
  for (const comp of (page.components ?? [])) {
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
        const initPct = (isFinite(comp.min ?? NaN) && isFinite(comp.max ?? NaN) && (comp.max ?? 0) > (comp.min ?? 0))
          ? Math.max(0, Math.min(100, ((comp.defaultValue ?? 50) - (comp.min ?? 0)) / ((comp.max ?? 100) - (comp.min ?? 0)) * 100))
          : 50

        card.innerHTML = `
          <div class="card-slider ${horiz ? 'horiz' : 'vert'}">
            <div class="card-slider-track">
              <div class="card-slider-fill"></div>
              <div class="card-slider-thumb"></div>
            </div>
            <div class="card-slider-val">${Math.round(comp.defaultValue ?? 50)}</div>
          </div>
          <div class="cell-label"></div>
          <div class="resize-handle"></div>`
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || ''

        const sliderTrack = card.querySelector<HTMLElement>('.card-slider-track')!
        const sliderFill  = card.querySelector<HTMLElement>('.card-slider-fill')!
        const sliderThumb = card.querySelector<HTMLElement>('.card-slider-thumb')!
        const sliderVal   = card.querySelector<HTMLElement>('.card-slider-val')!
        const HALF = 8

        function applySliderPct(pct: number): void {
          const num = (comp.min ?? 0) + ((comp.max ?? 100) - (comp.min ?? 0)) * pct / 100
          sliderVal.textContent = String(Math.round(num))
          if (horiz) {
            sliderFill.style.width  = `${pct}%`
            sliderThumb.style.left  = `calc(${pct}% - ${HALF}px)`
          } else {
            sliderFill.style.height  = `${pct}%`
            sliderThumb.style.bottom = `calc(${pct}% - ${HALF}px)`
          }
        }
        applySliderPct(initPct)

        sliderTrack.addEventListener('pointerdown', (e: PointerEvent) => {
          e.stopPropagation()
          e.preventDefault()
          sliderTrack.setPointerCapture(e.pointerId)
          sliderTrack.style.cursor = 'grabbing'

          function getPct(ev: PointerEvent): number {
            const rr = sliderTrack.getBoundingClientRect()
            return horiz
              ? Math.max(0, Math.min(100, (ev.clientX - rr.left) / rr.width  * 100))
              : Math.max(0, Math.min(100, (rr.bottom - ev.clientY) / rr.height * 100))
          }

          const onMove = (ev: PointerEvent) => applySliderPct(getPct(ev))
          const onUp   = (ev: PointerEvent) => {
            const pct = getPct(ev)
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
        card.innerHTML = '<div class="cell-type-badge">switch</div><div class="cell-switch-preview"><div class="cell-switch-thumb"></div></div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || ''
        break

      case 'knob':
        card.innerHTML = '<div class="cell-type-badge">knob</div><div class="cell-knob-preview">◎</div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || ''
        break

      case 'tile':
        card.innerHTML = '<div class="cell-type-badge">tile</div><div class="cell-tile-cmd"></div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-tile-cmd')!.textContent = (comp.pollCommand || '').substring(0, 26)
        card.querySelector<HTMLElement>('.cell-label')!.textContent    = comp.label || ''
        break

      case 'spotify':
        card.innerHTML = '<div class="cell-type-badge">spotify</div><div class="cell-icon">🎵</div><div class="cell-label">Spotify tile</div><div class="resize-handle"></div>'
        break

      case 'voice':
        card.innerHTML = '<div class="cell-type-badge">voice</div><div class="cell-icon"></div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-icon')!.textContent  = comp.icon || '🎤'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || 'Voice'
        break

      case 'plugin-tile':
        card.innerHTML = '<div class="cell-type-badge">plugin</div><div class="cell-tile-cmd"></div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-tile-cmd')!.textContent = `${comp.pluginTileId || ''}:${comp.pluginTileEvent || ''}`
        card.querySelector<HTMLElement>('.cell-label')!.textContent    = comp.label || ''
        break

      case 'folder': {
        const fpCount = (comp.pages || []).length
        card.innerHTML = `<div class="cell-type-badge">folder</div><div class="cell-icon"></div><div class="cell-label"></div>${fpCount ? '<div class="cell-hold-badge"></div>' : ''}<div class="resize-handle"></div>`
        card.querySelector<HTMLElement>('.cell-icon')!.textContent  = comp.icon || '📁'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || 'Folder'
        if (fpCount) card.querySelector<HTMLElement>('.cell-hold-badge')!.textContent = `${fpCount}p`
        break
      }

      case 'counter':
        card.innerHTML = '<div class="cell-type-badge">counter</div><div class="cell-icon">🔢</div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label
          ? `${comp.label} (step ${comp.counterStep ?? 1})`
          : `step ${comp.counterStep ?? 1}`
        break

      case 'clock':
        card.innerHTML = '<div class="cell-type-badge">clock</div><div class="cell-icon">🕐</div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.clockFormat ?? 'HH:mm'
        break

      case 'stopwatch':
        card.innerHTML = '<div class="cell-type-badge">stopwatch</div><div class="cell-icon">⏱</div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || 'Stopwatch'
        break

      case 'countdown': {
        const dur = comp.duration ?? 60
        card.innerHTML = '<div class="cell-type-badge">countdown</div><div class="cell-icon">⏲</div><div class="cell-label"></div><div class="resize-handle"></div>'
        card.querySelector<HTMLElement>('.cell-label')!.textContent = `${dur}s`
        break
      }

      default: // button
        card.innerHTML = `<div class="cell-icon"></div><div class="cell-label"></div>${comp.holdAction ? '<div class="cell-hold-badge">⟳</div>' : ''}<div class="resize-handle"></div>`
        card.querySelector<HTMLElement>('.cell-icon')!.textContent  = comp.icon || ''
        card.querySelector<HTMLElement>('.cell-label')!.textContent = comp.label || ''
    }

    // Resize handle — drag bottom-right corner
    const handle = card.querySelector<HTMLElement>('.resize-handle')!
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        const cell   = ptrToCell(ev, gridEl, cols, rows)
        comp.colSpan = Math.max(1, Math.min(cols - comp.col + 1, cell.col - comp.col + 1))
        comp.rowSpan = Math.max(1, Math.min(rows - comp.row + 1, cell.row - comp.row + 1))
        card.style.gridColumn = `${comp.col} / span ${comp.colSpan}`
        card.style.gridRow    = `${comp.row} / span ${comp.rowSpan}`
      }
      const onUp = () => {
        pushConfig()
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    })

    // Drag to move (card body) — short drag threshold distinguishes from click
    let moved = false, startX = 0, startY = 0
    card.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.target === handle || handle.contains(e.target as Node)) return
      e.preventDefault()
      card.setPointerCapture(e.pointerId)
      moved  = false
      startX = e.clientX
      startY = e.clientY
      card.style.cursor = 'grabbing'

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY
        if (!moved && dx * dx + dy * dy < 36) return
        moved = true
        const cell   = ptrToCell(ev, gridEl, cols, rows)
        const newCol = Math.max(1, Math.min(cols - (comp.colSpan || 1) + 1, cell.col))
        const newRow = Math.max(1, Math.min(rows - (comp.rowSpan || 1) + 1, cell.row))
        comp.col = newCol; comp.row = newRow
        card.style.gridColumn = `${newCol} / span ${comp.colSpan || 1}`
        card.style.gridRow    = `${newRow} / span ${comp.rowSpan || 1}`
      }
      const onUp = () => {
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
