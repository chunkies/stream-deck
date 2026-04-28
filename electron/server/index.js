'use strict'

const https     = require('https')
const WebSocket = require('ws')
const express   = require('express')
const multer    = require('multer')
const path      = require('path')
const fs        = require('fs')
const { execSync, exec }                               = require('child_process')
const { getCert }                                      = require('./cert')
const { executeCommand, executeBuiltin, executeHotkey, OS } = require('./keyboard')

const DEFAULT_CONFIG = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      components: [
        { id: 'c-prev', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: 'builtin', key: 'media.previous'  } },
        { id: 'c-play', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: 'builtin', key: 'media.playPause' } },
        { id: 'c-next', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: 'builtin', key: 'media.next'      } },
        { id: 'c-vol',  col: 1, row: 2, colSpan: 1, rowSpan: 2, componentType: 'slider', label: 'Volume', color: '#1e293b', min: 0, max: 100, step: 5, defaultValue: 50, action: { type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' } },
        { id: 'c-mute', col: 2, row: 2, colSpan: 2, rowSpan: 1, componentType: 'switch', label: 'Mute', color: '#1e293b', action: { type: 'toggle', on: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 1', off: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 0' } },
        { id: 'c-spty', col: 2, row: 3, colSpan: 2, rowSpan: 1, componentType: 'button', icon: '🎵', label: 'Spotify',   color: '#14532d', action: { type: 'command', command: 'spotify'      } },
        { id: 'c-tile', col: 1, row: 4, colSpan: 3, rowSpan: 1, componentType: 'tile',   label: 'Now Playing', color: '#0f172a', pollCommand: 'playerctl metadata title 2>/dev/null || echo "Nothing"', pollInterval: 3 }
      ]
    }
  ]
}

function migrateConfig(cfg) {
  const defaultCols = cfg.grid?.cols || 3
  for (const page of (cfg.pages || [])) {
    if (!page.components) {
      const cols = page.cols || defaultCols
      const components = []
      ;(page.slots || []).forEach((slot, i) => {
        if (!slot) return
        components.push({
          id: `cm${i}-${page.id}`,
          col: (i % cols) + 1,
          row: Math.floor(i / cols) + 1,
          colSpan: 1, rowSpan: 1,
          ...slot
        })
      })
      page.components = components
      delete page.slots
    }
    for (const comp of page.components) {
      if (comp.componentType === 'toggle') comp.componentType = 'switch'
    }
  }
  return cfg
}

let config          = null
let configFilePath  = null
let toggleStates    = {}
let slideLastValues = {}
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

      // Support two plugin patterns:
      // 1. Factory fn(sdk) => { 'action.key': handlerFn }  (plain object)
      // 2. Factory fn(sdk) using sdk.on('key', fn) — returns cleanup fn or nothing
      const sdk    = createSDK(manifest.id, pluginsDataDir || dir, broadcast)
      const result = typeof raw === 'function' ? raw(sdk) : raw

      // Merge sdk.on() registered handlers first, then any object returned by factory
      const handlers = { ...sdk._handlers, ...(result && typeof result === 'object' && !Array.isArray(result) && typeof result !== 'function' ? result : {}) }

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
    ;(page.components || []).forEach(comp => {
      if (comp?.componentType !== 'tile' || !comp.pollCommand) return
      const key      = `${page.id}:${comp.id}`
      const interval = Math.max(1, comp.pollInterval || 5) * 1000

      function poll() {
        try {
          const text = execSync(comp.pollCommand, {
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
  return config?.pages.some(p => (p.components || []).some(c => c?.componentType === 'spotify'))
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
    if (fs.existsSync(filePath)) return migrateConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')))
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
function handlePress(pageId, compId, hold = false) {
  const page = config.pages.find(p => p.id === pageId)
  const comp = page?.components.find(c => c.id === compId)
  if (comp?.componentType === 'tile' && comp.tileTapCmd) {
    executeCommand(comp.tileTapCmd)
    return
  }
  if (!comp?.action) return

  const action = (hold && comp.holdAction) ? comp.holdAction : comp.action

  switch (action.type) {
    case 'builtin':  executeBuiltin(action.key); break
    case 'command':  executeCommand(action.command); break
    case 'hotkey':   executeHotkey(action.combo); break
    case 'toggle': {
      const key    = `${pageId}:${compId}`
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
    case 'plugin': {
      const fn = pluginsMap[action.pluginKey]
      if (fn) {
        const isSwitch = comp?.componentType === 'switch'
        let callParams = { ...(action.params || {}) }
        if (isSwitch) {
          const key = `${pageId}:${compId}`
          toggleStates[key] = !toggleStates[key]
          const active = toggleStates[key]
          callParams.value = active
          broadcast({ type: 'toggleState', key, active })
        }
        const TIMEOUT = 10000
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Plugin action timed out')), TIMEOUT))
        Promise.race([Promise.resolve().then(() => fn(callParams)), timeout])
          .catch(err => console.error(`Plugin "${action.pluginKey}" error:`, err.message))
      } else {
        console.warn('Unknown plugin action:', action.pluginKey)
      }
      break
    }
  }
}

function handleSlide(pageId, compId, value) {
  const page = config.pages.find(p => p.id === pageId)
  const comp = page?.components.find(c => c.id === compId)
  if (!comp?.action) return
  const a    = comp.action
  const val  = String(Math.round(value))
  const key  = `${pageId}:${compId}`

  switch (a.type) {
    case 'volume': {
      const v = Math.round(value)
      if (OS === 'linux')  executeCommand(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${v}%`)
      else if (OS === 'darwin') executeCommand(`osascript -e 'set volume output volume ${v}'`)
      else executeCommand(`powershell -c "$vol=[math]::Round(${v}/100,2); (New-Object -ComObject WScript.Shell).SendKeys([char]174)"`)
      break
    }
    case 'scroll': {
      const last  = slideLastValues[key] ?? value
      const raw   = value - last
      slideLastValues[key] = value
      // Ignore large jumps (infinite scroll reset: slider snapping back to center)
      if (Math.abs(raw) > 15) break
      const delta = Math.round(raw)
      if (delta === 0) break
      const speed = a.speed || 2
      const steps = Math.min(Math.abs(delta) * speed, 12)
      const dir   = a.direction || 'vertical'
      if (OS === 'linux') {
        // xdotool: 4=up 5=down 6=left 7=right
        const btn = dir === 'horizontal' ? (delta > 0 ? 7 : 6) : (delta > 0 ? 5 : 4)
        for (let i = 0; i < steps; i++) executeCommand(`xdotool click --clearmodifiers ${btn}`)
      } else if (OS === 'darwin') {
        const amount = delta > 0 ? -steps : steps
        executeCommand(`osascript -e 'tell application "System Events" to scroll ${dir === 'horizontal' ? 'left' : 'up'} by ${Math.abs(amount)}'`)
      }
      break
    }
    case 'command':  executeCommand(a.command.replace(/{value}/g, val)); break
    case 'builtin':  executeBuiltin(a.key); break
    case 'hotkey':   executeHotkey(a.combo); break
    case 'sequence':
      a.commands.forEach((cmd, idx) =>
        setTimeout(() => executeCommand(cmd.replace(/{value}/g, val)), idx * (a.delay ?? 150))
      ); break
    case 'plugin': {
      const fn = pluginsMap[a.pluginKey]
      if (fn) {
        const TIMEOUT = 10000
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Plugin timed out')), TIMEOUT))
        Promise.race([Promise.resolve().then(() => fn({ ...(a.params || {}), value })), timeout])
          .catch(err => console.error(`Plugin slide "${a.pluginKey}" error:`, err.message))
      } else {
        console.warn('Unknown plugin action:', a.pluginKey)
      }
      break
    }
  }
}

// ── Voice command ──────────────────────────────────────
async function handleVoiceCommand(transcript, pageId, compId, voiceMode) {
  if (!transcript) return
  const mode = voiceMode || 'smart'
  console.log(`Voice [${mode}]: "${transcript}"`)

  if (mode === 'command') {
    executeCommand(transcript)
    return
  }

  if (mode === 'template') {
    const page = config.pages.find(p => p.id === pageId)
    const comp = page?.components?.find(c => c.id === compId)
    const template = comp?.voiceCommand || ''
    if (template) executeCommand(template.replace(/{transcript}/g, transcript.replace(/'/g, "'\\''")))
    return
  }

  if (mode === 'smart') {
    const allComps = config.pages.flatMap(pg =>
      (pg.components || []).map(c => ({ comp: c, page: pg }))
    ).filter(e => e.comp.label)

    const q = transcript.toLowerCase()
    let best = null; let bestScore = 0
    for (const entry of allComps) {
      const label = entry.comp.label.toLowerCase()
      const words = q.split(/\s+/)
      const hits  = words.filter(w => w.length > 2 && label.includes(w)).length
      const score = hits / words.length
      if (score > bestScore) { bestScore = score; best = entry }
    }

    if (best && bestScore >= 0.3) {
      handlePress(best.page.id, best.comp.id, false)
      broadcast({ type: 'voiceResult', matched: best.comp.label, transcript })
    } else {
      broadcast({ type: 'voiceResult', matched: null, transcript })
    }
    return
  }

}

// ── Public API ─────────────────────────────────────────
function getConfig()  { return config }
function getInfo()    { return serverInfo }

function setConfig(newConfig) {
  config       = migrateConfig(newConfig)
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

  const { key, cert, ip, host, mode } = await getCert(certDir)
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
    res.setHeader('Content-Disposition', 'attachment; filename="macropad.crt"')
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
        if (event.type === 'press')        { handlePress(event.pageId, event.compId, event.hold || false); onEvent(event) }
        if (event.type === 'slide')        { handleSlide(event.pageId, event.compId, event.value); onEvent(event) }
        if (event.type === 'voiceCommand') { handleVoiceCommand(event.transcript, event.pageId, event.compId, event.voiceMode) }
      } catch {}
    })

    ws.on('close', () => {
      connectedClients--
      onEvent({ type: 'connection', connected: connectedClients > 0, clients: connectedClients })
    })
  })

  await new Promise(resolve => server.listen(port, resolve))
  serverInfo = { ip, host, port, mode }
  console.log(`MacroPad running at https://${host}:${port} (${mode})`)

  // Start tile pollers after server is up
  startTilePollers()
  startSpotifyPoller()


  return serverInfo
}

module.exports = { start, getConfig, setConfig, getInfo, getPlugins, reloadPlugins }
