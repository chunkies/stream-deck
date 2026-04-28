'use strict'

let ws              = null
let config          = null
let currentPageIdx  = 0
let toggleStates    = {}
let touchStartX     = 0

const grid      = document.getElementById('grid')
const pageDots  = document.getElementById('page-dots')
const pageNameEl = document.getElementById('page-name')
const wsStatusEl = document.getElementById('ws-status')
const wsDotEl   = document.getElementById('ws-dot')

// ── WebSocket ─────────────────────────────────────────
function connect() {
  ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  ws.onopen = () => {
    wsStatusEl.textContent = 'Connected'
    wsDotEl.className      = 'dot connected'
  }
  ws.onclose = () => {
    wsStatusEl.textContent = 'Disconnected'
    wsDotEl.className      = 'dot disconnected'
    setTimeout(connect, 2000)
  }
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)

    if (msg.type === 'config') {
      config         = msg.config
      currentPageIdx = 0
      toggleStates   = {}
      render()
    }

    if (msg.type === 'toggleState') {
      toggleStates[msg.key] = msg.active
      updateToggleBtn(msg.key, msg.active)
    }
  }
}

function send(data) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

// ── Render ────────────────────────────────────────────
function render() {
  if (!config) return
  renderGrid()
  renderDots()
}

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
    const btn  = document.createElement('div')

    if (!slot) {
      btn.className = 'btn empty'
      grid.appendChild(btn)
      continue
    }

    const key = `${page.id}:${i}`
    btn.className      = 'btn' + (toggleStates[key] ? ' active' : '')
    btn.style.background = slot.color || '#1e293b'
    btn.dataset.key    = key
    btn.innerHTML      = `<div class="btn-icon">${slot.icon || ''}</div><div class="btn-label">${slot.label || ''}</div>`

    btn.addEventListener('pointerdown', () => {
      if (slot.action?.type === 'page') {
        navigateToPage(slot.action.pageId)
      } else {
        pressButton(page.id, i, btn)
      }
    })

    grid.appendChild(btn)
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

function updateToggleBtn(key, active) {
  const btn = grid.querySelector(`[data-key="${key}"]`)
  if (btn) btn.classList.toggle('active', active)
}

// ── Actions ───────────────────────────────────────────
function pressButton(pageId, slot, el) {
  navigator.vibrate?.(30)
  el.classList.add('pressed')
  setTimeout(() => el.classList.remove('pressed'), 150)
  send({ type: 'press', pageId, slot })
}

function navigateToPage(pageId) {
  const idx = config.pages.findIndex(p => p.id === pageId)
  if (idx !== -1) { currentPageIdx = idx; render() }
}

// ── Swipe between pages ───────────────────────────────
grid.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX
}, { passive: true })

grid.addEventListener('touchend', e => {
  if (!config) return
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) < 60) return
  if (dx < 0 && currentPageIdx < config.pages.length - 1) { currentPageIdx++; render() }
  if (dx > 0 && currentPageIdx > 0)                       { currentPageIdx--; render() }
})

// ── Init ─────────────────────────────────────────────
try { navigator.wakeLock.request('screen') } catch {}
connect()
