'use strict'

let ws             = null
let config         = null
let currentPageIdx = 0
let toggleStates   = {}
let reconnectTimer = null
let currentPages   = null   // active pages array (config.pages or folder sub-pages)
let navStack       = []     // [{pages, pageIdx}] folder breadcrumb stack
let swipeStartX    = 0
let swipeStartY    = 0
let swipeStartTime = 0
let swipeTracking  = false
let swipeActive    = false

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
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg.type === 'config')        { config = msg.config; currentPages = config.pages; currentPageIdx = 0; navStack = []; toggleStates = {}; render() }
    if (msg.type === 'toggleState')   { toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
    if (msg.type === 'tileUpdate')    { updateTile(msg.key, msg.text) }
    if (msg.type === 'spotifyUpdate') { updateSpotifyTile(msg) }
    if (msg.type === 'voiceResult')   { showVoiceResult(msg.matched, msg.transcript) }
    if (msg.type === 'pluginEvent')   { updatePluginTile(msg.pluginId, msg.event, msg) }
    if (msg.type === 'navigate') {
      navStack = []; currentPages = config.pages
      const idx = config?.pages.findIndex(p => p.id === msg.pageId)
      if (idx >= 0) { currentPageIdx = idx; render() }
    }
  }
}

function send(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }

// ── Render ─────────────────────────────────────────────
function render() { if (!config) return; renderGrid(); renderDots() }

function renderGrid() {
  const page = currentPages[currentPageIdx]
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
      case 'folder':      el = createFolder(comp, page);      break
      default:            el = createButton(comp, page);      break
    }
    el.style.gridColumn = `${comp.col} / span ${comp.colSpan || 1}`
    el.style.gridRow    = `${comp.row} / span ${comp.rowSpan || 1}`
    grid.appendChild(el)
  }
}

function renderDots() {
  pageDots.innerHTML = ''
  currentPages.forEach((_, i) => {
    const dot = document.createElement('div')
    dot.className = 'page-dot' + (i === currentPageIdx ? ' active' : '')
    dot.addEventListener('click', () => { currentPageIdx = i; render() })
    pageDots.appendChild(dot)
  })
  document.getElementById('back-btn')?.classList.toggle('hidden', navStack.length === 0)
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
      Haptic.tap()
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
        Haptic.hold()
        btn.classList.add('holding')
        setTimeout(() => btn.classList.remove('holding'), 400)
        send({ type: 'press', pageId: page.id, compId: comp.id, hold: true })
      }, 500)
    })

    btn.addEventListener('pointerup', () => {
      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
      if (!didHold) {
        Haptic.tap()
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
  applyBg(cell, comp.color, comp.image)

  cell.innerHTML = `
    <div class="switch-label">${comp.label || ''}</div>
    <div class="switch-track"><div class="switch-thumb"></div></div>
  `

  cell.addEventListener('pointerdown', () => {
    Haptic.tap()
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
  applyBg(cell, comp.color, comp.image)

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
      if (value !== lastSentValue) Haptic.ratchet()
      pct                 = valueToPct(value, min, max) / 100
      ringEl.innerHTML    = knobSVG(pct)
      valueEl.textContent = value
      // In infinite scroll mode, send continuously during drag
      if (comp.infiniteScroll && value !== lastSentValue) {
        send({ type: 'slide', pageId: page.id, compId: comp.id, value })
        lastSentValue = value
      }
    }
  })

  cell.addEventListener('pointerup', () => {
    if (!dragging) return
    dragging = false
    cell.classList.remove('dragging')
    if (comp.infiniteScroll) {
      // Reset to center so next drag starts fresh
      const center = comp.defaultValue ?? Math.round((min + max) / 2)
      value             = center
      pct               = valueToPct(center, min, max) / 100
      ringEl.innerHTML  = knobSVG(pct)
      valueEl.textContent = '·'
      send({ type: 'slide', pageId: page.id, compId: comp.id, value: center })
      lastSentValue = center
    } else {
      lastSentValue = value
      send({ type: 'slide', pageId: page.id, compId: comp.id, value })
    }
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
  applyBg(cell, comp.color, comp.image)
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
  applyBg(cell, comp.color, comp.image)
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
    Haptic.tap()
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
    try { rec.start(); listening = true; btn.classList.add('listening'); Haptic.listening() } catch {}
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
  applyBg(cell, comp.color, comp.image)

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
    if (ratchet && newVal !== value) Haptic.ratchet()
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

  if (comp.infiniteScroll) {
    // ── Infinite scroll mode: send during drag, reset visual on release ──
    let lastSentValue = comp.defaultValue ?? 50

    function getTrackValue(touch) {
      const rect = track.getBoundingClientRect()
      const p = horiz
        ? Math.max(0, Math.min(1, (touch.clientX - rect.left)  / rect.width))
        : Math.max(0, Math.min(1, (rect.bottom - touch.clientY) / rect.height))
      return Math.max(min, Math.min(max, Math.round((min + p * (max - min)) / step) * step))
    }

    function applyPct(pct) {
      if (horiz) { fill.style.width = `${pct}%`; thumb.style.left = `calc(${pct}% - 10px)` }
      else        { fill.style.height = `${pct}%`; thumb.style.bottom = `calc(${pct}% - 10px)` }
    }

    track.addEventListener('touchstart', e => {
      dragging = true; cell.classList.add('dragging')
      const v = getTrackValue(e.touches[0])
      applyPct(valueToPct(v, min, max)); valueEl.textContent = v
      e.preventDefault()
    }, { passive: false })

    track.addEventListener('touchmove', e => {
      if (!dragging) return
      const v = getTrackValue(e.touches[0])
      applyPct(valueToPct(v, min, max)); valueEl.textContent = v
      if (v !== lastSentValue) {
        Haptic.ratchet()
        send({ type: 'slide', pageId: page.id, compId: comp.id, value: v })
        lastSentValue = v
      }
      e.preventDefault()
    }, { passive: false })

    track.addEventListener('touchend', e => {
      if (!dragging) return
      dragging = false; cell.classList.remove('dragging')
      // Reset visual to center, send center value so server resets its delta tracking
      const center = comp.defaultValue ?? 50
      const centerPct = valueToPct(center, min, max)
      applyPct(centerPct); valueEl.textContent = '·'
      // Large jump → server ignores for scroll delta, just resets tracking value
      send({ type: 'slide', pageId: page.id, compId: comp.id, value: center })
      lastSentValue = center
    })

  } else {
    // ── Normal mode ──
    track.addEventListener('touchstart', e => { dragging = true; cell.classList.add('dragging'); update(e.touches[0]); e.preventDefault() }, { passive: false })
    track.addEventListener('touchmove',  e => { if (dragging) { update(e.touches[0], true); e.preventDefault() } }, { passive: false })
    track.addEventListener('touchend',   e => {
      if (!dragging) return
      dragging = false
      cell.classList.remove('dragging')
      update(e.changedTouches[0])
      send({ type: 'slide', pageId: page.id, compId: comp.id, value })
    })
  }

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

// ── Folder ────────────────────────────────────────────
function createFolder(comp, page) {
  const btn = document.createElement('div')
  btn.className = 'btn folder-btn'
  applyBg(btn, comp.color, comp.image)
  const pageCount = (comp.pages || []).length
  btn.innerHTML = `
    <div class="btn-icon">${comp.icon || '📁'}</div>
    <div class="btn-label">${comp.label || 'Folder'}</div>
    ${pageCount > 0 ? `<div class="folder-badge">${pageCount}</div>` : ''}
  `
  btn.addEventListener('pointerdown', () => {
    if (!comp.pages?.length) return
    Haptic.tap()
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    setTimeout(() => {
      navStack.push({ pages: currentPages, pageIdx: currentPageIdx })
      currentPages = comp.pages
      currentPageIdx = 0
      render()
    }, 80)
  })
  return btn
}

function goBack() {
  if (!navStack.length) return
  const prev = navStack.pop()
  currentPages = prev.pages
  currentPageIdx = prev.pageIdx
  render()
}

// ── Swipe between pages ────────────────────────────────
const appEl = document.querySelector('.app')

appEl.addEventListener('touchstart', e => {
  if (!config) return
  const t        = e.touches[0]
  swipeStartX    = t.clientX
  swipeStartY    = t.clientY
  swipeStartTime = Date.now()
  swipeTracking  = !e.target.closest('.slider-cell, .knob-cell')
  swipeActive    = false
}, { passive: true })

appEl.addEventListener('touchmove', e => {
  if (!swipeTracking || !config) return
  const dx = e.touches[0].clientX - swipeStartX
  const dy = e.touches[0].clientY - swipeStartY

  if (!swipeActive) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (Math.abs(dy) > Math.abs(dx) * 0.85) { swipeTracking = false; return }
    swipeActive = true
  }

  e.preventDefault()

  const atStart = currentPageIdx === 0 && navStack.length === 0
  const atEnd   = currentPageIdx === currentPages.length - 1
  const tx = (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.22 : dx
  grid.style.transition = 'none'
  grid.style.transform  = `translateX(${tx}px)`
}, { passive: false })

appEl.addEventListener('touchend', e => {
  if (!swipeActive) { swipeTracking = false; return }
  swipeTracking = false
  swipeActive   = false

  const dx       = e.changedTouches[0].clientX - swipeStartX
  const dt       = Math.max(1, Date.now() - swipeStartTime)
  const velocity = dx / dt

  const canGoNext = currentPageIdx < currentPages.length - 1
  const canGoPrev = currentPageIdx > 0 || navStack.length > 0
  const goNext    = dx < 0 && (Math.abs(velocity) > 0.35 || Math.abs(dx) > 55) && canGoNext
  const goPrev    = dx > 0 && (Math.abs(velocity) > 0.35 || Math.abs(dx) > 55) && canGoPrev

  if (goNext) {
    Haptic.ratchet()
    grid.style.transition = 'transform 0.16s ease-in'
    grid.style.transform  = 'translateX(-110%)'
    setTimeout(() => {
      grid.style.transition = ''
      grid.style.transform  = ''
      currentPageIdx++
      render()
    }, 160)
  } else if (goPrev) {
    Haptic.ratchet()
    grid.style.transition = 'transform 0.16s ease-in'
    grid.style.transform  = 'translateX(110%)'
    setTimeout(() => {
      grid.style.transition = ''
      grid.style.transform  = ''
      if (currentPageIdx > 0) { currentPageIdx--; render() }
      else { goBack() }
    }, 160)
  } else {
    grid.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    grid.style.transform  = ''
    setTimeout(() => { grid.style.transition = '' }, 280)
  }
}, { passive: true })

appEl.addEventListener('touchcancel', () => {
  if (swipeActive) {
    grid.style.transition = 'transform 0.22s ease'
    grid.style.transform  = ''
    setTimeout(() => { grid.style.transition = '' }, 220)
  }
  swipeTracking = false
  swipeActive   = false
}, { passive: true })

// ── Init ─────────────────────────────────────────────
document.getElementById('back-btn')?.addEventListener('pointerdown', () => { Haptic.tap(); goBack() })
try { navigator.wakeLock.request('screen') } catch {}
connect()
