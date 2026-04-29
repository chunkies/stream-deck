import https   from 'https'
import WebSocket, { WebSocketServer } from 'ws'
import express  from 'express'
import multer   from 'multer'
import crypto   from 'crypto'
import path     from 'path'
import fs       from 'fs'
import { execSync, exec } from 'child_process'
import { Worker }         from 'worker_threads'

import { getCert }                                              from './cert'
import { executeCommand, executeBuiltin, executeHotkey, OS }   from './keyboard'
import { PLATFORMS, ACTION_TYPES, COMPONENT_TYPES, MESSAGE_TYPES, TIMINGS } from './constants'
import { semverGt }                                            from './plugin-installer'

const PLUGIN_RUNNER = path.join(__dirname, 'plugin-runner.js')

const APP_VERSION = (() => {
  try { return (require('../../package.json') as { version: string }).version } catch { return '0.0.0' }
})()

// ── Config types ───────────────────────────────────────
interface Action {
  type:       string
  key?:       string
  command?:   string
  combo?:     string
  on?:        string
  off?:       string
  commands?:  string[]
  delay?:     number
  pageId?:    string
  pluginKey?: string
  params?:    Record<string, unknown>
  speed?:     number
  direction?: string
}

interface Component {
  id:             string
  col:            number
  row:            number
  colSpan:        number
  rowSpan:        number
  componentType:  string
  label?:         string
  icon?:          string
  color?:         string
  action?:        Action
  holdAction?:    Action
  tileTapCmd?:    string
  pollCommand?:   string
  pollInterval?:  number
  infiniteScroll?: boolean
  voiceCommand?:  string
  min?:           number
  max?:           number
  step?:          number
  defaultValue?:  number
}

interface Page {
  id:         string
  name:       string
  components: Component[]
  slots?:     unknown[]
  cols?:      number
}

interface Config {
  grid:  { cols: number; rows: number }
  pages: Page[]
}

interface ServerInfo {
  ip:   string
  host: string
  port: number
  mode: string
}

interface PluginMeta {
  id:          string
  name:        string
  version:     string
  description: string
  author:      string
  icon:        string
  _local:      boolean
  actions:     string[]
}

interface PendingCall {
  resolve: () => void
  reject:  (err: Error) => void
}

interface PluginWorker {
  worker:  Worker
  pending: Map<number, PendingCall>
  callId:  number
}

// ── Default config ─────────────────────────────────────
const DEFAULT_CONFIG: Config = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      components: [
        { id: 'c-prev', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: ACTION_TYPES.BUILTIN, key: 'media.previous'  } },
        { id: 'c-play', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: ACTION_TYPES.BUILTIN, key: 'media.playPause' } },
        { id: 'c-next', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: ACTION_TYPES.BUILTIN, key: 'media.next'      } },
        { id: 'c-vol',  col: 1, row: 2, colSpan: 1, rowSpan: 2, componentType: COMPONENT_TYPES.SLIDER, label: 'Volume', color: '#1e293b', min: 0, max: 100, step: 5, defaultValue: 50, action: { type: ACTION_TYPES.COMMAND, command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' } },
        { id: 'c-mute', col: 2, row: 2, colSpan: 2, rowSpan: 1, componentType: COMPONENT_TYPES.SWITCH, label: 'Mute', color: '#1e293b', action: { type: ACTION_TYPES.TOGGLE, on: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 1', off: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 0' } },
        { id: 'c-spty', col: 2, row: 3, colSpan: 2, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '🎵', label: 'Spotify',   color: '#14532d', action: { type: ACTION_TYPES.COMMAND, command: 'spotify'      } },
        { id: 'c-tile', col: 1, row: 4, colSpan: 3, rowSpan: 1, componentType: COMPONENT_TYPES.TILE,   label: 'Now Playing', color: '#0f172a', pollCommand: 'playerctl metadata title 2>/dev/null || echo "Nothing"', pollInterval: 3 }
      ]
    }
  ]
}

function migrateConfig(cfg: Config): Config {
  const defaultCols = cfg.grid?.cols || 3
  for (const page of (cfg.pages || [])) {
    if (!page.components) {
      const cols = page.cols || defaultCols
      const components: Component[] = []
      ;(page.slots || []).forEach((slot, i) => {
        if (!slot) return
        components.push({
          id: `cm${i}-${page.id}`,
          col: (i % cols) + 1,
          row: Math.floor(i / cols) + 1,
          colSpan: 1, rowSpan: 1,
          ...(slot as Partial<Component>)
        } as Component)
      })
      page.components = components
      delete page.slots
    }
    for (const comp of page.components) {
      if (comp.componentType === 'toggle') comp.componentType = COMPONENT_TYPES.SWITCH
    }
  }
  return cfg
}

function validateConfig(cfg: unknown): cfg is Config {
  return Boolean(
    cfg !== null &&
    typeof cfg === 'object' &&
    (cfg as Config).grid &&
    typeof (cfg as Config).grid.cols === 'number' &&
    typeof (cfg as Config).grid.rows === 'number' &&
    Array.isArray((cfg as Config).pages)
  )
}

let config:          Config | null     = null
let configFilePath:  string | null     = null
let toggleStates:    Record<string, boolean> = {}
let slideLastValues: Record<string, number>  = {}
let serverInfo:      ServerInfo | null = null
let wss:             WebSocketServer | null  = null
let connectedClients = 0

// ── Plugins ────────────────────────────────────────────
// Each plugin runs in its own worker_threads Worker.
// Crashes/hangs in a plugin cannot take down the server.
// The SDK surface is identical from the plugin author's perspective.

let pluginsMap:     Record<string, (params: unknown) => Promise<void>> = {}
let pluginsMeta:    PluginMeta[]  = []
let pluginsDataDir: string | null = null
const pluginWorkers: Record<string, PluginWorker> = {}

function makeActionCaller(pluginId: string, key: string): (params: unknown) => Promise<void> {
  return (params) => {
    const pw = pluginWorkers[pluginId]
    if (!pw) return Promise.reject(new Error(`Plugin "${pluginId}" not running`))
    return new Promise<void>((resolve, reject) => {
      const id = ++pw.callId
      pw.pending.set(id, { resolve, reject })
      pw.worker.postMessage({ type: 'invoke', id, key, params })
      setTimeout(() => {
        if (pw.pending.has(id)) {
          pw.pending.delete(id)
          reject(new Error(`Plugin "${key}" timed out after ${TIMINGS.PLUGIN_TIMEOUT_MS}ms`))
        }
      }, TIMINGS.PLUGIN_TIMEOUT_MS)
    })
  }
}

function spawnPluginWorker(manifest: { id: string; name?: string; version?: string }, dir: string): Promise<string[]> {
  const pending = new Map<number, PendingCall>()
  const worker  = new Worker(PLUGIN_RUNNER, {
    workerData: {
      pluginId:   manifest.id,
      pluginPath: path.join(dir, 'index.js'),
      dataDir:    pluginsDataDir ?? dir
    }
  })

  pluginWorkers[manifest.id] = { worker, pending, callId: 0 }

  worker.on('message', (msg: { type: string; id: number; error?: string; payload?: unknown }) => {
    if (msg.type === 'result') {
      const cb = pending.get(msg.id)
      if (cb) { pending.delete(msg.id); msg.error ? cb.reject(new Error(msg.error)) : cb.resolve() }
    } else if (msg.type === 'broadcast') {
      broadcast(msg.payload as Record<string, unknown>)
    }
  })

  worker.on('error', (err) => console.error(`Plugin "${manifest.id}" worker error:`, err.message))

  worker.on('exit', (code) => {
    if (code !== 0) console.error(`Plugin "${manifest.id}" worker exited (code ${code})`)
    delete pluginWorkers[manifest.id]
  })

  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {})
      reject(new Error('Plugin startup timeout'))
    }, 5000)

    worker.on('message', (msg: { type: string; actions?: string[]; error?: string }) => {
      if (msg.type === 'ready') {
        clearTimeout(timer)
        resolve(msg.actions ?? [])
      } else if (msg.type === 'error') {
        clearTimeout(timer)
        reject(new Error(msg.error))
      }
    })
  })
}

function stopAllWorkers(): void {
  for (const [id, pw] of Object.entries(pluginWorkers)) {
    pw.worker.terminate().catch(() => {})
    delete pluginWorkers[id]
  }
}

function loadPlugins(pluginsDir: string): void {
  stopAllWorkers()
  pluginsMap  = {}
  pluginsMeta = []

  if (!fs.existsSync(pluginsDir)) return

  for (const name of fs.readdirSync(pluginsDir)) {
    const dir = path.join(pluginsDir, name)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      const manifestPath = path.join(dir, 'manifest.json')
      const indexPath    = path.join(dir, 'index.js')
      if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) continue

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        id: string; name: string; version?: string; description?: string
        author?: string; icon?: string; _local?: boolean; actions?: string[]
        minAppVersion?: string
      }

      if (manifest.minAppVersion && semverGt(manifest.minAppVersion, APP_VERSION)) {
        console.warn(`Plugin "${manifest.id}" requires MacroPad v${manifest.minAppVersion} (current: v${APP_VERSION}) — skipping`)
        continue
      }

      // Register meta immediately so marketplace shows the plugin while it starts
      pluginsMeta.push({
        id:          manifest.id,
        name:        manifest.name,
        version:     manifest.version ?? '0.0.0',
        description: manifest.description ?? '',
        author:      manifest.author ?? '',
        icon:        manifest.icon ?? '',
        _local:      manifest._local ?? false,
        actions:     manifest.actions ?? []
      })

      // Spawn worker — resolves once the plugin reports ready
      spawnPluginWorker(manifest, dir).then(actions => {
        for (const key of actions) {
          if (pluginsMap[key]) console.warn(`Plugin conflict: "${key}" already registered — "${manifest.id}" overrides it`)
          pluginsMap[key] = makeActionCaller(manifest.id, key)
        }
        console.log(`Plugin loaded: ${manifest.name} v${manifest.version ?? '?'} (${actions.length} actions)`)
      }).catch(err => {
        console.error(`Plugin "${manifest.id}" failed to start:`, (err as Error).message)
        const idx = pluginsMeta.findIndex(m => m.id === manifest.id)
        if (idx !== -1) pluginsMeta.splice(idx, 1)
      })
    } catch (err) {
      console.error(`Plugin "${name}" failed to load:`, (err as Error).message)
    }
  }
}

function getPlugins(): PluginMeta[] { return pluginsMeta }
function reloadPlugins(pluginsDir: string): void { loadPlugins(pluginsDir); broadcast({ type: MESSAGE_TYPES.PLUGINS_RELOAD }) }

// ── Tile polling ───────────────────────────────────────
let tileTimers: Record<string, ReturnType<typeof setInterval>> = {}
let tileCache:  Record<string, string> = {}

function startTilePollers(): void {
  stopTilePollers()
  if (!config) return
  config.pages.forEach(page => {
    ;(page.components || []).forEach(comp => {
      if (comp?.componentType !== COMPONENT_TYPES.TILE || !comp.pollCommand) return
      const key      = `${page.id}:${comp.id}`
      const interval = Math.max(TIMINGS.TILE_POLL_MIN_MS, (comp.pollInterval ?? 5) * 1000)
      const cmd      = comp.pollCommand

      function poll(): void {
        try {
          const text = execSync(cmd, {
            shell: OS === PLATFORMS.WINDOWS ? 'cmd.exe' : '/bin/sh',
            timeout: TIMINGS.TILE_POLL_CMD_MS
          }).toString().trim().split('\n')[0]
          tileCache[key] = text
          broadcast({ type: MESSAGE_TYPES.TILE_UPDATE, key, text })
        } catch (err) {
          console.error(`Tile poll "${key}" failed:`, (err as Error).message)
        }
      }

      poll()
      tileTimers[key] = setInterval(poll, interval)
    })
  })
}

function stopTilePollers(): void {
  Object.values(tileTimers).forEach(clearInterval)
  tileTimers = {}
}


// ── Spotify poller ─────────────────────────────────────
let spotifyTimer:    ReturnType<typeof setInterval> | null = null
let spotifyState = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: 0 }
let spotifyMediaPath: string | null = null

// Safe base directories for MPRIS file:// art paths
const SAFE_ART_PREFIXES = ['/home', '/tmp', '/var/folders', '/private/var/folders']

function isArtPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return SAFE_ART_PREFIXES.some(prefix => resolved.startsWith(prefix))
}

function spotifyCommand(): string | null {
  if (OS === PLATFORMS.LINUX)  return 'playerctl metadata --format "{{status}}\t{{title}}\t{{artist}}\t{{mpris:artUrl}}" 2>/dev/null'
  if (OS === PLATFORMS.DARWIN) return `osascript -e 'tell application "Spotify" to return (player state as string)&"\\t"&(name of current track)&"\\t"&(artist of current track)&"\\t"&(artwork url of current track)' 2>/dev/null`
  return null
}

async function downloadSpotifyArt(url: string): Promise<boolean> {
  if (!url || !spotifyMediaPath) return false
  try {
    const dest = path.join(spotifyMediaPath, 'spotify-art.jpg')
    if (url.startsWith('file://')) {
      const src = decodeURIComponent(url.slice(7))
      if (!isArtPathSafe(src)) {
        console.warn('Rejected Spotify art path outside safe directories:', src)
        return false
      }
      if (fs.existsSync(src)) { fs.copyFileSync(src, dest); return true }
      return false
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMINGS.SPOTIFY_ART_FETCH_MS) })
    if (!res.ok) return false
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    return true
  } catch { return false }
}

function pollSpotify(): void {
  const cmd = spotifyCommand()
  if (!cmd) return

  exec(cmd, { timeout: TIMINGS.SPOTIFY_POLL_MS }, async (err, stdout) => {
    if (err || !stdout.trim()) {
      if (spotifyState.title) {
        spotifyState = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: spotifyState.artVersion }
        broadcast({ type: MESSAGE_TYPES.SPOTIFY_UPDATE, ...spotifyState })
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
    if (changed) broadcast({ type: MESSAGE_TYPES.SPOTIFY_UPDATE, title, artist, isPlaying, artVersion })
  })
}

function hasSpotifyTile(): boolean {
  return config?.pages.some(p => (p.components || []).some(c => c?.componentType === COMPONENT_TYPES.SPOTIFY)) ?? false
}

function startSpotifyPoller(): void {
  stopSpotifyPoller()
  if (!hasSpotifyTile()) return
  pollSpotify()
  spotifyTimer = setInterval(pollSpotify, TIMINGS.SPOTIFY_POLL_MS)
}

function stopSpotifyPoller(): void {
  if (spotifyTimer) { clearInterval(spotifyTimer); spotifyTimer = null }
}

// ── Config ─────────────────────────────────────────────
function loadConfig(filePath: string): Config {
  try {
    if (fs.existsSync(filePath)) return migrateConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')) as Config)
  } catch {}
  saveConfig(filePath, DEFAULT_CONFIG)
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config
}

function saveConfig(filePath: string, cfg: Config): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2))
}

function broadcast(msg: Record<string, unknown>): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}

// ── Press / Slide ──────────────────────────────────────
function handlePress(pageId: string, compId: string, hold = false): void {
  if (!config) return
  const page = config.pages.find(p => p.id === pageId)
  const comp = page?.components.find(c => c.id === compId)
  if (comp?.componentType === COMPONENT_TYPES.TILE && comp.tileTapCmd) {
    executeCommand(comp.tileTapCmd)
    return
  }
  if (!comp?.action) return

  const action = (hold && comp.holdAction) ? comp.holdAction : comp.action

  switch (action.type) {
    case ACTION_TYPES.BUILTIN:  executeBuiltin(action.key!); break
    case ACTION_TYPES.COMMAND:  executeCommand(action.command); break
    case ACTION_TYPES.HOTKEY:   executeHotkey(action.combo); break
    case ACTION_TYPES.TOGGLE: {
      const key    = `${pageId}:${compId}`
      toggleStates[key] = !toggleStates[key]
      const active = toggleStates[key]
      executeCommand(active ? action.on : action.off)
      broadcast({ type: MESSAGE_TYPES.TOGGLE_STATE, key, active })
      break
    }
    case ACTION_TYPES.SEQUENCE:
      action.commands!.forEach((cmd, idx) => setTimeout(() => executeCommand(cmd), idx * (action.delay ?? TIMINGS.SEQUENCE_DEFAULT_MS)))
      break
    case ACTION_TYPES.PAGE:
      broadcast({ type: MESSAGE_TYPES.NAVIGATE, pageId: action.pageId })
      break
    case ACTION_TYPES.PLUGIN: {
      const fn = pluginsMap[action.pluginKey!]
      if (fn) {
        const callParams: Record<string, unknown> = { ...(action.params ?? {}) }
        if (comp?.componentType === COMPONENT_TYPES.SWITCH) {
          const key = `${pageId}:${compId}`
          toggleStates[key] = !toggleStates[key]
          callParams['value'] = toggleStates[key]
          broadcast({ type: MESSAGE_TYPES.TOGGLE_STATE, key, active: toggleStates[key] })
        }
        fn(callParams).catch(err => console.error(`Plugin "${action.pluginKey}" error:`, (err as Error).message))
      } else {
        console.warn('Unknown plugin action:', action.pluginKey)
      }
      break
    }
  }
}

function handleSlide(pageId: string, compId: string, value: number): void {
  if (!config) return
  const page = config.pages.find(p => p.id === pageId)
  const comp = page?.components.find(c => c.id === compId)
  if (!comp?.action) return
  const a    = comp.action
  const val  = String(Math.round(value))
  const key  = `${pageId}:${compId}`

  switch (a.type) {
    case ACTION_TYPES.VOLUME: {
      const v = Math.round(value)
      if (OS === PLATFORMS.LINUX)        executeCommand(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${v}%`)
      else if (OS === PLATFORMS.DARWIN)  executeCommand(`osascript -e 'set volume output volume ${v}'`)
      else                               executeCommand(`nircmd setsysvolume ${Math.round(v / 100 * 65535)}`)
      break
    }
    case ACTION_TYPES.SCROLL: {
      const last  = slideLastValues[key] ?? value
      const raw   = value - last
      slideLastValues[key] = value
      // Ignore large jumps (infinite scroll reset: slider snapping back to center)
      if (Math.abs(raw) > 15) break
      const delta = Math.round(raw)
      if (delta === 0) break
      const speed = a.speed ?? 2
      const steps = Math.min(Math.abs(delta) * speed, 12)
      const dir   = a.direction ?? 'vertical'
      if (OS === PLATFORMS.LINUX) {
        // xdotool: 4=up 5=down 6=left 7=right
        const btn = dir === 'horizontal' ? (delta > 0 ? 7 : 6) : (delta > 0 ? 5 : 4)
        for (let i = 0; i < steps; i++) executeCommand(`xdotool click --clearmodifiers ${btn}`)
      } else if (OS === PLATFORMS.DARWIN) {
        const amount = delta > 0 ? -steps : steps
        executeCommand(`osascript -e 'tell application "System Events" to scroll ${dir === 'horizontal' ? 'left' : 'up'} by ${Math.abs(amount)}'`)
      }
      break
    }
    case ACTION_TYPES.COMMAND: {
      let cmd = a.command!.replace(/{value}/g, val)
      if (comp.infiniteScroll) {
        const last  = slideLastValues[key] ?? value
        const raw   = value - last
        slideLastValues[key] = value
        if (Math.abs(raw) > 15) break
        const delta = Math.round(raw)
        if (delta === 0) break
        cmd = a.command!.replace(/{delta}/g, String(delta)).replace(/{value}/g, val)
      }
      executeCommand(cmd)
      break
    }
    case ACTION_TYPES.BUILTIN:  executeBuiltin(a.key!); break
    case ACTION_TYPES.HOTKEY:   executeHotkey(a.combo); break
    case ACTION_TYPES.SEQUENCE:
      a.commands!.forEach((cmd, idx) =>
        setTimeout(() => executeCommand(cmd.replace(/{value}/g, val)), idx * (a.delay ?? TIMINGS.SEQUENCE_DEFAULT_MS))
      ); break
    case ACTION_TYPES.PLUGIN: {
      const fn = pluginsMap[a.pluginKey!]
      if (fn) {
        fn({ ...(a.params ?? {}), value }).catch(err => console.error(`Plugin slide "${a.pluginKey}" error:`, (err as Error).message))
      } else {
        console.warn('Unknown plugin action:', a.pluginKey)
      }
      break
    }
  }
}

// ── Voice command ──────────────────────────────────────
async function handleVoiceCommand(transcript: string, pageId: string, compId: string, voiceMode: string): Promise<void> {
  if (!transcript || !config) return
  const mode = voiceMode || 'smart'
  console.log(`Voice [${mode}]: "${transcript}"`)

  if (mode === 'command') {
    executeCommand(transcript)
    return
  }

  if (mode === 'template') {
    const page = config.pages.find(p => p.id === pageId)
    const comp = page?.components?.find(c => c.id === compId)
    const template = comp?.voiceCommand ?? ''
    if (template) {
      // Standard POSIX single-quote escaping: end the quote, insert escaped quote, reopen
      const escaped = transcript.replace(/'/g, "'\\''")
      executeCommand(template.replace(/{transcript}/g, escaped))
    }
    return
  }

  if (mode === 'smart') {
    const allComps = config.pages.flatMap(pg =>
      (pg.components || []).map(c => ({ comp: c, page: pg }))
    ).filter(e => e.comp.label)

    const q = transcript.toLowerCase()
    let best: { comp: Component; page: Page } | null = null
    let bestScore = 0
    for (const entry of allComps) {
      const label = entry.comp.label!.toLowerCase()
      const words = q.split(/\s+/)
      const hits  = words.filter(w => w.length > 2 && label.includes(w)).length
      const score = hits / words.length
      if (score > bestScore) { bestScore = score; best = entry }
    }

    if (best && bestScore >= 0.3) {
      handlePress(best.page.id, best.comp.id, false)
      broadcast({ type: MESSAGE_TYPES.VOICE_RESULT, matched: best.comp.label, transcript })
    } else {
      broadcast({ type: MESSAGE_TYPES.VOICE_RESULT, matched: null, transcript })
    }
  }
}

// ── Public API ─────────────────────────────────────────
function getConfig(): Config | null  { return config }
function getInfo():   ServerInfo | null { return serverInfo }

function setConfig(newConfig: unknown): void {
  if (!validateConfig(newConfig)) {
    console.error('setConfig: rejected invalid config structure')
    return
  }
  config          = migrateConfig(newConfig)
  toggleStates    = {}
  slideLastValues = {}
  saveConfig(configFilePath!, config)
  broadcast({ type: MESSAGE_TYPES.CONFIG, config })
  startTilePollers()
  startSpotifyPoller()
}

// ── Server start ───────────────────────────────────────
interface StartPaths {
  pwaPath?:     string
  mediaPath?:   string
  certDir?:     string
  pluginsPath?: string
  configPath?:  string
}

type EventFn = (event: Record<string, unknown>) => void

export async function start(onEvent: EventFn, port = 3000, paths: StartPaths = {}): Promise<ServerInfo> {
  const pwaPath     = paths.pwaPath     ?? path.join(__dirname, '../../pwa')
  const mediaPath   = paths.mediaPath   ?? path.join(__dirname, '../../media')
  const certDir     = paths.certDir     ?? path.join(__dirname, '../../.cert')
  const pluginsDir  = paths.pluginsPath ?? path.join(__dirname, '../../plugins')
  configFilePath    = paths.configPath  ?? path.join(__dirname, '../../config.json')
  config = loadConfig(configFilePath)

  pluginsDataDir = path.join(path.dirname(pluginsDir), 'plugins-data')
  fs.mkdirSync(mediaPath,      { recursive: true })
  fs.mkdirSync(pluginsDir,     { recursive: true })
  fs.mkdirSync(pluginsDataDir, { recursive: true })
  spotifyMediaPath = mediaPath
  loadPlugins(pluginsDir)

  const { key, cert, ip, host, mode } = await getCert(certDir)
  const app = express()

  // Security headers for all responses
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  const upload = multer({
    storage: multer.diskStorage({
      destination: mediaPath,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '') || '.bin'
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`)
      }
    }),
    limits: { fileSize: 20 * 1024 * 1024 }
  })
  app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'No file' }); return }
    res.json({ url: `/media/${req.file.filename}` })
  })
  app.use('/media', express.static(mediaPath))

  app.get('/cert.crt', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert')
    res.setHeader('Content-Disposition', 'attachment; filename="macropad.crt"')
    res.send(cert)
  })
  app.use(express.static(pwaPath))

  const server = https.createServer({ key, cert }, app)
  wss = new WebSocketServer({ server })

  // Simple per-client rate limit: max 60 messages per second
  const RATE_LIMIT    = 60
  const RATE_WINDOW_MS = 1000

  wss.on('connection', (ws) => {
    connectedClients++
    onEvent({ type: MESSAGE_TYPES.CONNECTION, connected: true, clients: connectedClients })
    ws.send(JSON.stringify({ type: MESSAGE_TYPES.CONFIG, config }))

    // Send cached tile values to new client
    for (const [k, text] of Object.entries(tileCache)) {
      ws.send(JSON.stringify({ type: MESSAGE_TYPES.TILE_UPDATE, key: k, text }))
    }
    // Send cached Spotify state to new client
    if (spotifyState.title || spotifyState.isPlaying) {
      ws.send(JSON.stringify({ type: MESSAGE_TYPES.SPOTIFY_UPDATE, ...spotifyState }))
    }

    let msgCount   = 0
    let windowStart = Date.now()

    ws.on('message', (data) => {
      // Rate limiting
      const now = Date.now()
      if (now - windowStart >= RATE_WINDOW_MS) { msgCount = 0; windowStart = now }
      msgCount++
      if (msgCount > RATE_LIMIT) {
        console.warn('WebSocket rate limit exceeded — dropping message')
        return
      }

      try {
        const event = JSON.parse(data.toString()) as { type: string; pageId: string; compId: string; hold?: boolean; value?: number; transcript?: string; voiceMode?: string }
        if (event.type === MESSAGE_TYPES.PRESS)         { handlePress(event.pageId, event.compId, event.hold ?? false); onEvent(event as Record<string, unknown>) }
        if (event.type === MESSAGE_TYPES.SLIDE)         { handleSlide(event.pageId, event.compId, event.value ?? 0); onEvent(event as Record<string, unknown>) }
        if (event.type === MESSAGE_TYPES.VOICE_COMMAND) { handleVoiceCommand(event.transcript ?? '', event.pageId, event.compId, event.voiceMode ?? 'smart') }
      } catch (err) {
        console.error('WebSocket message parse error:', (err as Error).message)
      }
    })

    ws.on('close', () => {
      connectedClients--
      onEvent({ type: MESSAGE_TYPES.CONNECTION, connected: connectedClients > 0, clients: connectedClients })
    })
  })

  await new Promise<void>(resolve => server.listen(port, resolve))
  serverInfo = { ip, host, port, mode }
  console.log(`MacroPad running at https://${host}:${port} (${mode})`)

  startTilePollers()
  startSpotifyPoller()

  return serverInfo
}

export { getConfig, setConfig, getInfo, getPlugins, reloadPlugins }
