'use strict'

const https     = require('https')
const WebSocket = require('ws')
const express   = require('express')
const multer    = require('multer')
const path      = require('path')
const fs        = require('fs')
const { execSync }                                     = require('child_process')
const { generateCert }                                 = require('./cert')
const { executeCommand, executeBuiltin, executeHotkey, OS } = require('./keyboard')

const DEFAULT_CONFIG = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      slots: [
        { componentType: 'button', icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: 'builtin', key: 'media.previous'  } },
        { componentType: 'button', icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: 'builtin', key: 'media.playPause' } },
        { componentType: 'button', icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: 'builtin', key: 'media.next'      } },
        { componentType: 'slider', label: 'Volume', color: '#1e293b', min: 0, max: 100, step: 5, defaultValue: 50, action: { type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' } },
        { componentType: 'toggle', icon: '🔇', activeIcon: '🔊', label: 'Muted', activeLabel: 'Unmuted', color: '#1e293b', activeColor: '#4f46e5', action: { type: 'toggle', on: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 1', off: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 0' } },
        { componentType: 'button', icon: '🎵', label: 'Spotify',    color: '#14532d', action: { type: 'command', command: 'spotify' } },
        { componentType: 'button', icon: '🔒', label: 'Lock',       color: '#3b1f1f', action: { type: 'builtin', key: 'system.lock' } },
        { componentType: 'button', icon: '💤', label: 'Sleep',      color: '#1e293b', action: { type: 'builtin', key: 'system.sleep' } },
        { componentType: 'button', icon: '📷', label: 'Screenshot', color: '#1e293b', action: { type: 'builtin', key: 'system.screenshot' } },
        { componentType: 'tile', label: 'Now Playing', color: '#0f172a', pollCommand: 'playerctl metadata title 2>/dev/null || echo "Nothing"', pollInterval: 3 },
        null, null
      ]
    }
  ]
}

let config          = null
let configFilePath  = null
let toggleStates    = {}
let serverInfo      = null
let wss             = null
let connectedClients = 0

// ── Tile polling ───────────────────────────────────────
let tileTimers = {}
let tileCache  = {}

function startTilePollers() {
  stopTilePollers()
  if (!config) return
  config.pages.forEach(page => {
    page.slots.forEach((slot, i) => {
      if (slot?.componentType !== 'tile' || !slot.pollCommand) return
      const key      = `${page.id}:${i}`
      const interval = Math.max(1, slot.pollInterval || 5) * 1000

      function poll() {
        try {
          const text = execSync(slot.pollCommand, {
            shell: OS === 'win32' ? 'cmd.exe' : '/bin/sh',
            timeout: 3000
          }).toString().trim().split('\n')[0]
          tileCache[key] = text
          broadcast({ type: 'tileUpdate', key, text })
        } catch {}
      }

      poll()
      tileTimers[key] = setInterval(poll, interval)
    })
  })
}

function stopTilePollers() {
  Object.values(tileTimers).forEach(clearInterval)
  tileTimers = {}
}

// ── OBS integration ────────────────────────────────────
let obs      = null
let obsReady = false

async function connectOBS(host, port, password) {
  if (obs) { try { await obs.disconnect() } catch {} }
  obsReady = false
  try {
    const { OBSWebSocket } = require('obs-websocket-js')
    obs = new OBSWebSocket()
    obs.on('ConnectionClosed', () => { obsReady = false })
    await obs.connect(`ws://${host}:${port}`, password || undefined)
    obsReady = true
    return true
  } catch (err) {
    console.error('OBS connect failed:', err.message)
    obs = null
    return false
  }
}

async function handleOBSAction(action) {
  if (!obs || !obsReady) { console.warn('OBS not connected'); return }
  try {
    switch (action.obsAction) {
      case 'switchScene':      await obs.call('SetCurrentProgramScene', { sceneName: action.obsScene }); break
      case 'toggleRecording':  await obs.call('ToggleRecord'); break
      case 'toggleStreaming':  await obs.call('ToggleStream'); break
      case 'muteToggle':       await obs.call('ToggleInputMute', { inputName: action.obsSource }); break
    }
  } catch (err) { console.error('OBS action failed:', err.message) }
}

// ── Config ─────────────────────────────────────────────
function loadConfig(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {}
  saveConfig(filePath, DEFAULT_CONFIG)
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
}

function saveConfig(filePath, cfg) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2))
}

function broadcast(msg) {
  if (!wss) return
  const data = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}

// ── Press / Slide ──────────────────────────────────────
function handlePress(pageId, slotIndex, hold = false) {
  const page = config.pages.find(p => p.id === pageId)
  const slot = page?.slots[slotIndex]
  if (!slot?.action) return

  const action = (hold && slot.holdAction) ? slot.holdAction : slot.action

  switch (action.type) {
    case 'builtin':  executeBuiltin(action.key); break
    case 'command':  executeCommand(action.command); break
    case 'hotkey':   executeHotkey(action.combo); break
    case 'toggle': {
      const key    = `${pageId}:${slotIndex}`
      toggleStates[key] = !toggleStates[key]
      const active = toggleStates[key]
      executeCommand(active ? action.on : action.off)
      broadcast({ type: 'toggleState', key, active })
      break
    }
    case 'sequence':
      action.commands.forEach((cmd, idx) => setTimeout(() => executeCommand(cmd), idx * (action.delay ?? 150)))
      break
    case 'page':
      broadcast({ type: 'navigate', pageId: action.pageId })
      break
    case 'obs':
      handleOBSAction(action).catch(err => console.error('OBS:', err.message))
      break
  }
}

function handleSlide(pageId, slotIndex, value) {
  const page = config.pages.find(p => p.id === pageId)
  const slot = page?.slots[slotIndex]
  if (!slot?.action) return
  if (slot.action.type === 'command') {
    executeCommand(slot.action.command.replace(/{value}/g, String(Math.round(value))))
  }
}

// ── Public API ─────────────────────────────────────────
function getConfig()  { return config }
function getInfo()    { return serverInfo }
function isOBSReady() { return obsReady }

function setConfig(newConfig) {
  config       = newConfig
  toggleStates = {}
  saveConfig(configFilePath, config)
  broadcast({ type: 'config', config })
  startTilePollers()
}

// ── Server start ───────────────────────────────────────
async function start(onEvent, port = 3000, paths = {}) {
  const pwaPath   = paths.pwaPath   || path.join(__dirname, '../../pwa')
  const mediaPath = paths.mediaPath || path.join(__dirname, '../../media')
  const certDir   = paths.certDir   || path.join(__dirname, '../../.cert')
  configFilePath  = paths.configPath || path.join(__dirname, '../../config.json')
  config = loadConfig(configFilePath)

  fs.mkdirSync(mediaPath, { recursive: true })

  const { key, cert, ip } = generateCert(certDir)
  const app = express()

  const upload = multer({
    storage: multer.diskStorage({
      destination: mediaPath,
      filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    limits: { fileSize: 20 * 1024 * 1024 }
  })
  app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' })
    res.json({ url: `/media/${req.file.filename}` })
  })
  app.use('/media', express.static(mediaPath))

  app.get('/cert.crt', (req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert')
    res.setHeader('Content-Disposition', 'attachment; filename="stream-deck.crt"')
    res.send(cert)
  })
  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.use(express.static(pwaPath))

  const server = https.createServer({ key, cert }, app)
  wss = new WebSocket.Server({ server })

  wss.on('connection', (ws) => {
    connectedClients++
    onEvent({ type: 'connection', connected: true, clients: connectedClients })
    ws.send(JSON.stringify({ type: 'config', config }))

    // Send cached tile values to new client
    for (const [k, text] of Object.entries(tileCache)) {
      ws.send(JSON.stringify({ type: 'tileUpdate', key: k, text }))
    }

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString())
        if (event.type === 'press') { handlePress(event.pageId, event.slot, event.hold || false); onEvent(event) }
        if (event.type === 'slide') { handleSlide(event.pageId, event.slot, event.value); onEvent(event) }
      } catch {}
    })

    ws.on('close', () => {
      connectedClients--
      onEvent({ type: 'connection', connected: connectedClients > 0, clients: connectedClients })
    })
  })

  await new Promise(resolve => server.listen(port, resolve))
  serverInfo = { ip, port }
  console.log(`Stream Deck running at https://${ip}:${port}`)

  // Start tile pollers after server is up
  startTilePollers()

  // Auto-connect OBS if settings saved
  if (config.obsSettings?.host) {
    const { host: h, port: p, password: pw } = config.obsSettings
    connectOBS(h, p || 4455, pw).catch(() => {})
  }

  return serverInfo
}

module.exports = { start, getConfig, setConfig, getInfo, connectOBS, isOBSReady }
