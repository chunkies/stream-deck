'use strict'

let ws             = null
let config         = null
let currentPageIdx = 0
let toggleStates   = {}
let touchStartX    = 0

const grid       = document.getElementById('grid')
const pageDots   = document.getElementById('page-dots')
const pageNameEl = document.getElementById('page-name')
const wsStatusEl = document.getElementById('ws-status')
const wsDotEl    = document.getElementById('ws-dot')

// ── WebSocket ─────────────────────────────────────────
function connect() {
  ws = new WebSocket(`wss://${location.hostname}:${location.port}`)
  ws.onopen  = () => { wsStatusEl.textContent = 'Connected';    wsDotEl.className = 'dot connected' }
  ws.onclose = () => { wsStatusEl.textContent = 'Disconnected'; wsDotEl.className = 'dot disconnected'; setTimeout(connect, 2000) }
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'config')      { config = msg.config; currentPageIdx = 0; toggleStates = {}; render() }
    if (msg.type === 'toggleState') { toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
  }
}

function send(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }

// ── Render ─────────────────────────────────────────────
function render() { if (!config) return; renderGrid(); renderDots() }

function renderGrid() {
  const page       = config.pages[currentPageIdx]
  const { cols, rows } = config.grid
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  grid.innerHTML = ''
  pageNameEl.textContent = page.name

  const total = cols * rows
  for (let i = 0; i < total; i++) {
    const slot = page.slots[i] ?? null
    if (!slot) { const el = document.createElement('div'); el.className = 'btn empty'; grid.appendChild(el); continue }

    switch (slot.componentType) {
      case 'slider': grid.appendChild(createSlider(slot, page, i)); break
      case 'toggle': grid.appendChild(createToggle(slot, page, i)); break
      default:       grid.appendChild(createButton(slot, page, i)); break
    }
  }
}

function renderDots() {
  pageDots.innerHTML = ''
  config.pages.forEach((_, i) => {
    const dot = document.createElement('div')
    dot.className = 'page-dot' + (i === currentPageIdx ? ' active' : '')
    dot.addEventListener('click', () => { currentPageIdx = i; render() })
    pageDots.appendChild(dot)
  })
}

// ── Button ────────────────────────────────────────────
function createButton(slot, page, i) {
  const btn = document.createElement('div')
  btn.className = 'btn'
  applyBg(btn, slot.color, slot.image)
  btn.innerHTML = `<div class="btn-icon">${slot.icon || ''}</div><div class="btn-label">${slot.label || ''}</div>`
  btn.addEventListener('pointerdown', () => {
    navigator.vibrate?.(30)
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, slot: i })
  })
  return btn
}

// ── Toggle ────────────────────────────────────────────
function createToggle(slot, page, i) {
  const key    = `${page.id}:${i}`
  const active = toggleStates[key] || false
  const btn    = document.createElement('div')

  btn.className    = 'btn toggle-btn' + (active ? ' active' : '')
  btn.dataset.key  = key
  btn.dataset.slot = i
  btn.dataset.pageId = page.id

  refreshToggleVisual(btn, slot, active)

  btn.addEventListener('pointerdown', () => {
    navigator.vibrate?.(30)
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, slot: i })
  })
  return btn
}

function refreshToggleVisual(btn, slot, active) {
  const icon  = active ? (slot.activeIcon  || slot.icon)  : slot.icon
  const label = active ? (slot.activeLabel || slot.label) : slot.label
  const color = active ? (slot.activeColor || slot.color) : slot.color
  const image = active ? (slot.activeImage || slot.image) : slot.image
  applyBg(btn, color, image)
  btn.innerHTML = `<div class="btn-icon">${icon || ''}</div><div class="btn-label">${label || ''}</div>`
}

function updateToggleBtn(key, active) {
  const btn = grid.querySelector(`[data-key="${key}"]`)
  if (!btn) return
  btn.classList.toggle('active', active)

  const parts    = key.split(':')
  const pageId   = parts[0]
  const slotIdx  = parseInt(parts[1])
  const page     = config.pages.find(p => p.id === pageId)
  const slot     = page?.slots[slotIdx]
  if (slot) refreshToggleVisual(btn, slot, active)
}

// ── Slider ────────────────────────────────────────────
function createSlider(slot, page, i) {
  const cell = document.createElement('div')
  cell.className = 'slider-cell'
  cell.style.background = slot.color || '#1e293b'

  const min  = slot.min          ?? 0
  const max  = slot.max          ?? 100
  const step = slot.step         ?? 1
  let value  = slot.defaultValue ?? 50

  const pct = valueToPct(value, min, max)
  cell.innerHTML = `
    <div class="slider-label">${slot.label || ''}</div>
    <div class="slider-track">
      <div class="slider-fill" style="height:${pct}%"></div>
      <div class="slider-thumb" style="bottom:calc(${pct}% - 10px)"></div>
    </div>
    <div class="slider-value">${value}</div>
  `

  const track   = cell.querySelector('.slider-track')
  const fill    = cell.querySelector('.slider-fill')
  const thumb   = cell.querySelector('.slider-thumb')
  const valueEl = cell.querySelector('.slider-value')
  let dragging  = false

  function update(touch) {
    const rect   = track.getBoundingClientRect()
    const relY   = rect.bottom - touch.clientY
    const raw    = min + (Math.max(0, Math.min(1, relY / rect.height))) * (max - min)
    value = Math.max(min, Math.min(max, Math.round(raw / step) * step))
    const p = valueToPct(value, min, max)
    fill.style.height  = `${p}%`
    thumb.style.bottom = `calc(${p}% - 10px)`
    valueEl.textContent = value
  }

  track.addEventListener('touchstart', e => { dragging = true; update(e.touches[0]); e.preventDefault() }, { passive: false })
  track.addEventListener('touchmove',  e => { if (dragging) { update(e.touches[0]); e.preventDefault() } }, { passive: false })
  track.addEventListener('touchend',   e => {
    if (!dragging) return
    dragging = false
    update(e.changedTouches[0])
    navigator.vibrate?.(20)
    send({ type: 'slide', pageId: page.id, slot: i, value })
  })

  return cell
}

function valueToPct(v, min, max) { return ((v - min) / (max - min)) * 100 }

// ── Helpers ───────────────────────────────────────────
function applyBg(el, color, image) {
  if (image) {
    el.style.backgroundImage    = `url(${image})`
    el.style.backgroundSize     = 'cover'
    el.style.backgroundPosition = 'center'
    el.style.backgroundColor    = color || '#1e293b'
  } else {
    el.style.backgroundImage = ''
    el.style.background      = color || '#1e293b'
  }
}

// ── Swipe between pages ───────────────────────────────
grid.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX }, { passive: true })
grid.addEventListener('touchend', e => {
  if (!config) return
  // Only trigger page swipe if touch started on a non-slider cell
  if (e.target.closest('.slider-cell')) return
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) < 60) return
  if (dx < 0 && currentPageIdx < config.pages.length - 1) { currentPageIdx++; render() }
  if (dx > 0 && currentPageIdx > 0)                       { currentPageIdx--; render() }
})

// ── Init ─────────────────────────────────────────────
try { navigator.wakeLock.request('screen') } catch {}
connect()
