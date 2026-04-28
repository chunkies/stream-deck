'use strict'

const https     = require('https')
const WebSocket = require('ws')
const express   = require('express')
const multer    = require('multer')
const path      = require('path')
const fs        = require('fs')
const { execSync, exec }                               = require('child_process')
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

// ── Plugins ────────────────────────────────────────────
const { createSDK }    = require('./plugin-sdk')
let pluginsMap         = {}
let pluginsMeta        = []
let activePluginsDir   = null
let pluginsDataDir     = null

function loadPlugins(pluginsDir) {
  // Resolve real path so symlinked plugins clear cache correctly
  const realDir = (() => { try { return fs.realpathSync(pluginsDir) } catch { return pluginsDir } })()

  // Clear require cache for previously loaded plugins (supports symlinks)
  for (const key of Object.keys(require.cache)) {
    let realKey
    try { realKey = fs.realpathSync(key) } catch { realKey = key }
    if (realKey.startsWith(realDir)) delete require.cache[key]
  }

  pluginsMap       = {}
  pluginsMeta      = []
  activePluginsDir = realDir
  if (!fs.existsSync(pluginsDir)) return

  for (const name of fs.readdirSync(pluginsDir)) {
    const dir = path.join(pluginsDir, name)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      const manifestPath = path.join(dir, 'manifest.json')
      const indexPath    = path.join(dir, 'index.js')
      if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) continue

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const raw       = require(indexPath)

      // Support factory (sdk) => handlers and plain object exports
      const sdk      = createSDK(manifest.id, pluginsDataDir || dir, broadcast)
      const handlers = typeof raw === 'function' ? raw(sdk) : raw

      // Warn on action key conflicts between plugins
      for (const key of Object.keys(handlers)) {
        if (pluginsMap[key]) console.warn(`Plugin conflict: "${key}" already registered — "${manifest.id}" overrides it`)
      }

      pluginsMeta.push({
        id:          manifest.id,
        name:        manifest.name,
        version:     manifest.version || '0.0.0',
        description: manifest.description || '',
        author:      manifest.author || '',
        icon:        manifest.icon || '',
        _local:      manifest._local || false,
        actions:     manifest.actions || []
      })
      Object.assign(pluginsMap, handlers)
      console.log(`Plugin loaded: ${manifest.name} v${manifest.version || '?'}`)
    } catch (err) {
      console.error(`Plugin "${name}" failed to load:`, err.message)
    }
  }
}

function getPlugins() { return pluginsMeta }
function reloadPlugins(pluginsDir) { loadPlugins(pluginsDir); broadcast({ type: 'pluginsReloaded' }) }

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

// ── Spotify poller ─────────────────────────────────────
let spotifyTimer    = null
let spotifyState    = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: 0 }
let spotifyMediaPath = null

function spotifyCommand() {
  if (OS === 'linux')  return 'playerctl metadata --format "{{status}}\t{{title}}\t{{artist}}\t{{mpris:artUrl}}" 2>/dev/null'
  if (OS === 'darwin') return `osascript -e 'tell application "Spotify" to return (player state as string)&"\\t"&(name of current track)&"\\t"&(artist of current track)&"\\t"&(artwork url of current track)' 2>/dev/null`
  return null
}

async function downloadSpotifyArt(url) {
  if (!url || !spotifyMediaPath) return false
  try {
    const dest = path.join(spotifyMediaPath, 'spotify-art.jpg')
    if (url.startsWith('file://')) {
      const src = decodeURIComponent(url.slice(7))
      if (fs.existsSync(src)) { fs.copyFileSync(src, dest); return true }
      return false
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    return true
  } catch { return false }
}

function pollSpotify() {
  const cmd = spotifyCommand()
  if (!cmd) return

  exec(cmd, { timeout: 2000 }, async (err, stdout) => {
    if (err || !stdout.trim()) {
      if (spotifyState.title) {
        spotifyState = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: spotifyState.artVersion }
        broadcast({ type: 'spotifyUpdate', ...spotifyState })
      }
      return
    }
    const [status, title = '', artist = '', artUrl = ''] = stdout.trim().split('\t')
    const isPlaying = status === 'Playing'

    let artVersion = spotifyState.artVersion
    if (artUrl && artUrl !== spotifyState.artUrl) {
      const ok = await downloadSpotifyArt(artUrl)
      if (ok) artVersion = Date.now()
    }

    const changed = title !== spotifyState.title || artist !== spotifyState.artist
                  || isPlaying !== spotifyState.isPlaying || artVersion !== spotifyState.artVersion

    spotifyState = { title, artist, isPlaying, artUrl, artVersion }
    if (changed) broadcast({ type: 'spotifyUpdate', title, artist, isPlaying, artVersion })
  })
}

function hasSpotifyTile() {
  return config?.pages.some(p => p.slots.some(s => s?.componentType === 'spotify'))
}

function startSpotifyPoller() {
  stopSpotifyPoller()
  if (!hasSpotifyTile()) return
  pollSpotify()
  spotifyTimer = setInterval(pollSpotify, 2000)
}

function stopSpotifyPoller() {
  if (spotifyTimer) { clearInterval(spotifyTimer); spotifyTimer = null }
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
    case 'plugin': {
      const fn = pluginsMap[action.pluginKey]
      if (fn) {
        const TIMEOUT = 10000
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Plugin action timed out')), TIMEOUT))
        Promise.race([Promise.resolve().then(() => fn(action.params || {})), timeout])
          .catch(err => console.error(`Plugin "${action.pluginKey}" error:`, err.message))
      } else {
        console.warn('Unknown plugin action:', action.pluginKey)
      }
      break
    }
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
  startSpotifyPoller()
}

// ── Server start ───────────────────────────────────────
async function start(onEvent, port = 3000, paths = {}) {
  const pwaPath     = paths.pwaPath     || path.join(__dirname, '../../pwa')
  const mediaPath   = paths.mediaPath   || path.join(__dirname, '../../media')
  const certDir     = paths.certDir     || path.join(__dirname, '../../.cert')
  const pluginsDir  = paths.pluginsPath || path.join(__dirname, '../../plugins')
  configFilePath    = paths.configPath  || path.join(__dirname, '../../config.json')
  config = loadConfig(configFilePath)

  pluginsDataDir = path.join(path.dirname(pluginsDir), 'plugins-data')
  fs.mkdirSync(mediaPath,      { recursive: true })
  fs.mkdirSync(pluginsDir,     { recursive: true })
  fs.mkdirSync(pluginsDataDir, { recursive: true })
  spotifyMediaPath = mediaPath
  loadPlugins(pluginsDir)

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
    // Send cached Spotify state to new client
    if (spotifyState.title || spotifyState.isPlaying) {
      ws.send(JSON.stringify({ type: 'spotifyUpdate', ...spotifyState }))
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
  startSpotifyPoller()

  // Auto-connect OBS if settings saved
  if (config.obsSettings?.host) {
    const { host: h, port: p, password: pw } = config.obsSettings
    connectOBS(h, p || 4455, pw).catch(() => {})
  }

  return serverInfo
}

module.exports = { start, getConfig, setConfig, getInfo, connectOBS, isOBSReady, getPlugins, reloadPlugins }
