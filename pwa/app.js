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
  grid.classList.remove('page-in')
  void grid.offsetWidth
  grid.classList.add('page-in')

  for (const comp of (page.components || [])) {
    let el
    switch (comp.componentType) {
      case 'slider':      el = createSlider(comp, page);      break
      case 'switch':
      case 'toggle':      el = createSwitch(comp, page);      break
      case 'knob':        el = createKnob(comp, page);        break
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

// ── Switch (replaces Toggle) ──────────────────────────
function createSwitch(comp, page) {
  const key    = `${page.id}:${comp.id}`
  const active = toggleStates[key] || false
  const cell   = document.createElement('div')

  cell.className      = 'switch-cell' + (active ? ' active' : '')
  cell.dataset.key    = key
  cell.dataset.compId = comp.id
  cell.dataset.pageId = page.id

  cell.innerHTML = `
    <div class="switch-label">${comp.label || ''}</div>
    <div class="switch-track"><div class="switch-thumb"></div></div>
  `

  cell.addEventListener('pointerdown', () => {
    navigator.vibrate?.(30)
    cell.classList.add('pressed')
    setTimeout(() => cell.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
  })
  return cell
}

function updateToggleBtn(key, active) {
  const el = grid.querySelector(`[data-key="${key}"]`)
  if (!el) return
  el.classList.toggle('active', active)
}

// ── Knob ──────────────────────────────────────────────
function polarToXY(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const s = polarToXY(cx, cy, r, startDeg)
  const e = polarToXY(cx, cy, r, endDeg)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function knobSVG(pct) {
  const cx = 36, cy = 36, r = 27
  const start = -135, range = 270
  const currentDeg = start + pct * range
  const trackArc = describeArc(cx, cy, r, start, start + range)
  const fillArc  = pct > 0.001 ? describeArc(cx, cy, r, start, currentDeg) : null
  const tick     = polarToXY(cx, cy, r - 3, currentDeg)
  return `<svg viewBox="0 0 72 72" width="100%" height="100%">
    <defs>
      <linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#a78bfa"/>
      </linearGradient>
    </defs>
    <path d="${trackArc}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4" stroke-linecap="round"/>
    ${fillArc ? `<path d="${fillArc}" fill="none" stroke="url(#kg)" stroke-width="4" stroke-linecap="round"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="18" fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
    <circle cx="${tick.x.toFixed(2)}" cy="${tick.y.toFixed(2)}" r="2.5" fill="${pct > 0.001 ? '#a78bfa' : 'rgba(255,255,255,0.25)'}"/>
  </svg>`
}

function createKnob(comp, page) {
  const cell = document.createElement('div')
  cell.className = 'knob-cell'

  const min  = comp.min ?? 0
  const max  = comp.max ?? 100
  const step = comp.step ?? 1
  let value  = comp.defaultValue ?? Math.round((min + max) / 2)
  let pct    = valueToPct(value, min, max) / 100

  cell.innerHTML = `
    <div class="knob-label">${comp.label || ''}</div>
    <div class="knob-ring">${knobSVG(pct)}</div>
    <div class="knob-value">${value}</div>
  `

  const ringEl  = cell.querySelector('.knob-ring')
  const valueEl = cell.querySelector('.knob-value')

  let startY = 0, startVal = value, dragging = false, lastSentValue = value

  cell.addEventListener('pointerdown', e => {
    startY        = e.clientY
    startVal      = value
    lastSentValue = value
    dragging      = true
    cell.classList.add('dragging')
    cell.setPointerCapture(e.pointerId)
    e.preventDefault()
  })

  cell.addEventListener('pointermove', e => {
    if (!dragging) return
    const dy     = startY - e.clientY
    const raw    = startVal + (dy / 140) * (max - min)
    const newVal = Math.max(min, Math.min(max, Math.round(raw / step) * step))
    if (newVal !== value) {
      value = newVal
      if (value !== lastSentValue) navigator.vibrate?.(8)
      pct                 = valueToPct(value, min, max) / 100
      ringEl.innerHTML    = knobSVG(pct)
      valueEl.textContent = value
    }
  })

  cell.addEventListener('pointerup', () => {
    if (!dragging) return
    dragging = false
    cell.classList.remove('dragging')
    lastSentValue = value
    send({ type: 'slide', pageId: page.id, compId: comp.id, value })
  })

  cell.addEventListener('pointercancel', () => {
    dragging = false
    cell.classList.remove('dragging')
  })

  return cell
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
  if (!el) return
  el.textContent = text
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
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
    if (!el) return
    el.textContent = val
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
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
  const horiz = comp.orientation === 'horizontal'
  const cell  = document.createElement('div')
  cell.className = 'slider-cell' + (horiz ? ' horizontal' : '')
  cell.style.background = comp.color || '#1e293b'

  const min  = comp.min          ?? 0
  const max  = comp.max          ?? 100
  const step = comp.step         ?? 1
  let value  = comp.defaultValue ?? 50

  const pct = valueToPct(value, min, max)

  if (horiz) {
    cell.innerHTML = `
      <div class="slider-label">${comp.label || ''}</div>
      <div class="slider-track">
        <div class="slider-fill" style="width:${pct}%"></div>
        <div class="slider-thumb" style="left:calc(${pct}% - 10px)"></div>
      </div>
      <div class="slider-value">${value}</div>
    `
  } else {
    cell.innerHTML = `
      <div class="slider-label">${comp.label || ''}</div>
      <div class="slider-track">
        <div class="slider-fill" style="height:${pct}%"></div>
        <div class="slider-thumb" style="bottom:calc(${pct}% - 10px)"></div>
      </div>
      <div class="slider-value">${value}</div>
    `
  }

  const track   = cell.querySelector('.slider-track')
  const fill    = cell.querySelector('.slider-fill')
  const thumb   = cell.querySelector('.slider-thumb')
  const valueEl = cell.querySelector('.slider-value')
  let dragging  = false

  function update(touch, ratchet = false) {
    const rect = track.getBoundingClientRect()
    const p = horiz
      ? Math.max(0, Math.min(1, (touch.clientX - rect.left)  / rect.width))
      : Math.max(0, Math.min(1, (rect.bottom - touch.clientY) / rect.height))
    const raw    = min + p * (max - min)
    const newVal = Math.max(min, Math.min(max, Math.round(raw / step) * step))
    if (ratchet && newVal !== value) navigator.vibrate?.(8)
    value = newVal
    const pv = valueToPct(value, min, max)
    if (horiz) {
      fill.style.width  = `${pv}%`
      thumb.style.left  = `calc(${pv}% - 10px)`
    } else {
      fill.style.height  = `${pv}%`
      thumb.style.bottom = `calc(${pv}% - 10px)`
    }
    valueEl.textContent = value
  }

  track.addEventListener('touchstart', e => { dragging = true; cell.classList.add('dragging'); update(e.touches[0]); e.preventDefault() }, { passive: false })
  track.addEventListener('touchmove',  e => { if (dragging) { update(e.touches[0], true); e.preventDefault() } }, { passive: false })
  track.addEventListener('touchend',   e => {
    if (!dragging) return
    dragging = false
    cell.classList.remove('dragging')
    update(e.changedTouches[0])
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
  if (e.target.closest('.slider-cell') || e.target.closest('.knob-cell') || e.target.closest('.tile-cell') || e.target.closest('.spotify-cell') || e.target.closest('.voice-btn')) return
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) < 60) return
  if (dx < 0 && currentPageIdx < config.pages.length - 1) { currentPageIdx++; render() }
  else if (dx > 0 && currentPageIdx > 0)                  { currentPageIdx--; render() }
})

// ── Init ─────────────────────────────────────────────
try { navigator.wakeLock.request('screen') } catch {}
connect()
