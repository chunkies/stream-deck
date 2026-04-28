'use strict'

let ws             = null
let config         = null
let currentPageIdx = 0
let toggleStates   = {}
let touchStartX    = 0
let reconnectTimer = null

const grid         = document.getElementById('grid')
const pageDots     = document.getElementById('page-dots')
const pageNameEl   = document.getElementById('page-name')
const wsStatusEl   = document.getElementById('ws-status')
const wsDotEl      = document.getElementById('ws-dot')
const offlineEl    = document.getElementById('offline-overlay')

// ── WebSocket ─────────────────────────────────────────
function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  ws.onopen = () => {
    wsStatusEl.textContent = 'Connected'
    wsDotEl.className = 'dot connected'
    offlineEl.classList.remove('visible')
  }

  ws.onclose = () => {
    wsStatusEl.textContent = 'Reconnecting…'
    wsDotEl.className = 'dot disconnected'
    offlineEl.classList.add('visible')
    reconnectTimer = setTimeout(connect, 2500)
  }

  ws.onerror = () => ws.close()

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'config')        { config = msg.config; currentPageIdx = 0; toggleStates = {}; render() }
    if (msg.type === 'toggleState')   { toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
    if (msg.type === 'tileUpdate')    { updateTile(msg.key, msg.text) }
    if (msg.type === 'spotifyUpdate') { updateSpotifyTile(msg) }
    if (msg.type === 'voiceResult')   { showVoiceResult(msg.matched, msg.transcript) }
    if (msg.type === 'pluginEvent')   { updatePluginTile(msg.pluginId, msg.event, msg) }
    if (msg.type === 'navigate') {
      const idx = config?.pages.findIndex(p => p.id === msg.pageId)
      if (idx >= 0) { currentPageIdx = idx; render() }
    }
  }
}

function send(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }

// ── Render ─────────────────────────────────────────────
function render() { if (!config) return; renderGrid(); renderDots() }

function renderGrid() {
  const page = config.pages[currentPageIdx]
  const cols = page.cols || config.grid.cols
  const rows = config.grid.rows
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  grid.innerHTML = ''
  pageNameEl.textContent = page.name

  for (const comp of (page.components || [])) {
    let el
    switch (comp.componentType) {
      case 'slider':      el = createSlider(comp, page);      break
      case 'toggle':      el = createToggle(comp, page);      break
      case 'tile':        el = createTile(comp, page);        break
      case 'spotify':     el = createSpotifyTile(comp, page); break
      case 'voice':       el = createVoiceButton(comp, page); break
      case 'plugin-tile': el = createPluginTile(comp, page);  break
      default:            el = createButton(comp, page);      break
    }
    el.style.gridColumn = `${comp.col} / span ${comp.colSpan || 1}`
    el.style.gridRow    = `${comp.row} / span ${comp.rowSpan || 1}`
    grid.appendChild(el)
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
function createButton(comp, page) {
  const btn = document.createElement('div')
  btn.className = 'btn'
  applyBg(btn, comp.color, comp.image)
  btn.innerHTML = `<div class="btn-icon">${comp.icon || ''}</div><div class="btn-label">${comp.label || ''}</div>`

  const hasHold = !!comp.holdAction

  if (!hasHold) {
    btn.addEventListener('pointerdown', () => {
      navigator.vibrate?.(30)
      btn.classList.add('pressed')
      setTimeout(() => btn.classList.remove('pressed'), 150)
      send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
    })
  } else {
    let holdTimer = null
    let didHold   = false

    btn.addEventListener('pointerdown', () => {
      didHold   = false
      holdTimer = setTimeout(() => {
        didHold   = true
        holdTimer = null
        navigator.vibrate?.([50, 50, 50])
        btn.classList.add('holding')
        setTimeout(() => btn.classList.remove('holding'), 400)
        send({ type: 'press', pageId: page.id, compId: comp.id, hold: true })
      }, 500)
    })

    btn.addEventListener('pointerup', () => {
      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
      if (!didHold) {
        navigator.vibrate?.(30)
        btn.classList.add('pressed')
        setTimeout(() => btn.classList.remove('pressed'), 150)
        send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
      }
    })

    btn.addEventListener('pointercancel', () => {
      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
    })
  }

  return btn
}

// ── Toggle ────────────────────────────────────────────
function createToggle(comp, page) {
  const key    = `${page.id}:${comp.id}`
  const active = toggleStates[key] || false
  const btn    = document.createElement('div')

  btn.className      = 'btn toggle-btn' + (active ? ' active' : '')
  btn.dataset.key    = key
  btn.dataset.compId = comp.id
  btn.dataset.pageId = page.id

  refreshToggleVisual(btn, comp, active)

  btn.addEventListener('pointerdown', () => {
    navigator.vibrate?.(30)
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
  })
  return btn
}

function refreshToggleVisual(btn, comp, active) {
  const icon  = active ? (comp.activeIcon  || comp.icon)  : comp.icon
  const label = active ? (comp.activeLabel || comp.label) : comp.label
  const color = active ? (comp.activeColor || comp.color) : comp.color
  const image = active ? (comp.activeImage || comp.image) : comp.image
  applyBg(btn, color, image)
  btn.innerHTML = `<div class="btn-icon">${icon || ''}</div><div class="btn-label">${label || ''}</div>`
}

function updateToggleBtn(key, active) {
  const btn = grid.querySelector(`[data-key="${key}"]`)
  if (!btn) return
  btn.classList.toggle('active', active)
  const [pageId, compId] = key.split(':')
  const pg   = config.pages.find(p => p.id === pageId)
  const comp = pg?.components?.find(c => c.id === compId)
  if (comp) refreshToggleVisual(btn, comp, active)
}

// ── Tile ──────────────────────────────────────────────
function createTile(comp, page) {
  const cell = document.createElement('div')
  cell.className = 'tile-cell'
  cell.style.background = comp.color || '#0f172a'
  cell.dataset.key = `${page.id}:${comp.id}`
  cell.innerHTML = `
    <div class="tile-label">${comp.label || ''}</div>
    <div class="tile-value">—</div>
  `
  return cell
}

function updateTile(key, text) {
  const el = grid.querySelector(`[data-key="${key}"] .tile-value`)
  if (el) el.textContent = text
}

// ── Plugin tile ───────────────────────────────────────
function createPluginTile(comp, page) {
  const cell = document.createElement('div')
  cell.className = 'tile-cell plugin-tile-cell'
  cell.style.background  = comp.color           || '#0f172a'
  cell.dataset.pluginId  = comp.pluginTileId    || ''
  cell.dataset.eventName = comp.pluginTileEvent || ''
  cell.dataset.field     = comp.pluginTileField || 'value'
  cell.innerHTML = `
    <div class="tile-label">${comp.label || ''}</div>
    <div class="tile-value">—</div>
  `
  return cell
}

function updatePluginTile(pluginId, eventName, msg) {
  document.querySelectorAll('.plugin-tile-cell').forEach(cell => {
    if (cell.dataset.pluginId !== pluginId) return
    if (cell.dataset.eventName !== eventName) return
    const field = cell.dataset.field || 'value'
    const val = msg[field] ?? msg.value ?? JSON.stringify(msg)
    const el = cell.querySelector('.tile-value')
    if (el) el.textContent = val
  })
}

// ── Spotify tile ──────────────────────────────────────
function createSpotifyTile(comp, page) {
  const cell = document.createElement('div')
  cell.className = 'spotify-cell'
  cell.style.background = comp.color || '#0f172a'
  cell.innerHTML = `
    <div class="spotify-art"></div>
    <div class="spotify-overlay">
      <div class="spotify-status">—</div>
      <div class="spotify-title">Nothing playing</div>
      <div class="spotify-artist"></div>
    </div>
  `
  cell.addEventListener('pointerdown', () => {
    navigator.vibrate?.(30)
    cell.classList.add('pressed')
    setTimeout(() => cell.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
  })
  return cell
}

function updateSpotifyTile(state) {
  document.querySelectorAll('.spotify-cell').forEach(cell => {
    const artEl    = cell.querySelector('.spotify-art')
    const titleEl  = cell.querySelector('.spotify-title')
    const artistEl = cell.querySelector('.spotify-artist')
    const statusEl = cell.querySelector('.spotify-status')

    titleEl.textContent  = state.title  || 'Nothing playing'
    artistEl.textContent = state.artist || ''
    statusEl.textContent = state.isPlaying ? '▶' : (state.title ? '⏸' : '—')

    if (state.artVersion) {
      artEl.style.backgroundImage = `url(${location.origin}/media/spotify-art.jpg?v=${state.artVersion})`
    } else {
      artEl.style.backgroundImage = ''
    }
  })
}

// ── Voice button ──────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

function createVoiceButton(comp, page) {
  const btn = document.createElement('div')
  btn.className = 'btn voice-btn'
  applyBg(btn, comp.color, comp.image)

  if (!SpeechRecognition) {
    btn.innerHTML = `<div class="btn-icon">${comp.icon || '🎤'}</div><div class="btn-label">${comp.label || 'Voice'}</div><div class="voice-unsupported">Not supported</div>`
    btn.style.opacity = '0.5'
    return btn
  }

  btn.innerHTML = `
    <div class="btn-icon">${comp.icon || '🎤'}</div>
    <div class="btn-label voice-label">${comp.label || 'Voice'}</div>
    <div class="voice-ring"></div>
  `

  const rec = new SpeechRecognition()
  rec.continuous     = false
  rec.interimResults = false
  rec.lang           = comp.voiceLang || 'en-US'

  let listening = false

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim()
    stopListening()
    const labelEl = btn.querySelector('.voice-label')
    if (labelEl) { labelEl.textContent = `"${transcript}"`; setTimeout(() => { labelEl.textContent = comp.label || 'Voice' }, 3000) }
    send({ type: 'voiceCommand', transcript, pageId: page.id, compId: comp.id, voiceMode: comp.voiceMode || 'smart' })
  }

  rec.onerror = (e) => {
    stopListening()
    if (e.error === 'not-allowed') {
      const labelEl = btn.querySelector('.voice-label')
      if (labelEl) { labelEl.textContent = 'Mic blocked'; setTimeout(() => { labelEl.textContent = comp.label || 'Voice' }, 3000) }
    }
  }

  rec.onend = () => stopListening()

  function startListening() {
    try { rec.start(); listening = true; btn.classList.add('listening'); navigator.vibrate?.([40, 20, 40]) } catch {}
  }

  function stopListening() {
    listening = false
    btn.classList.remove('listening')
    try { rec.stop() } catch {}
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (listening) { stopListening() } else { startListening() }
  })

  return btn
}

function showVoiceResult(matched, transcript) {
  document.querySelectorAll('.voice-btn .voice-label').forEach(el => {
    const original = el.closest('.btn')?.querySelector('.btn-label')?.textContent || 'Voice'
    el.textContent = matched ? `→ ${matched}` : 'No match'
    setTimeout(() => { el.textContent = original }, 3000)
  })
}

// ── Slider ────────────────────────────────────────────
function createSlider(comp, page) {
  const cell = document.createElement('div')
  cell.className = 'slider-cell'
  cell.style.background = comp.color || '#1e293b'

  const min  = comp.min          ?? 0
  const max  = comp.max          ?? 100
  const step = comp.step         ?? 1
  let value  = comp.defaultValue ?? 50

  const pct = valueToPct(value, min, max)
  cell.innerHTML = `
    <div class="slider-label">${comp.label || ''}</div>
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
    const rect = track.getBoundingClientRect()
    const relY = rect.bottom - touch.clientY
    const raw  = min + Math.max(0, Math.min(1, relY / rect.height)) * (max - min)
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
    send({ type: 'slide', pageId: page.id, compId: comp.id, value })
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
  if (e.target.closest('.slider-cell') || e.target.closest('.tile-cell') || e.target.closest('.spotify-cell') || e.target.closest('.voice-btn')) return
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) < 60) return
  if (dx < 0 && currentPageIdx < config.pages.length - 1) { currentPageIdx++; render() }
  if (dx > 0 && currentPageIdx > 0)                       { currentPageIdx--; render() }
})

// ── Init ─────────────────────────────────────────────
try { navigator.wakeLock.request('screen') } catch {}
connect()
