import https   from 'https'
import http    from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import express  from 'express'
import multer   from 'multer'
import crypto   from 'crypto'
import path     from 'path'
import fs       from 'fs'
import { Worker }         from 'worker_threads'

import { getCert }                                              from './cert'
import { executeCommand, executeBuiltin, executeHotkey, moveMouse, clickMouse, scrollMouse, OS } from './keyboard'
import { PLATFORMS, ACTION_TYPES, COMPONENT_TYPES, MESSAGE_TYPES, TIMINGS } from './constants'
import { semverGt, autoUpdatePlugins }                         from './plugin-installer'
import { loadConfig, saveConfig, validateConfig, migrateConfig } from './config'
import { validateLicense, loadLicense, saveLicense } from './license'
import { startTilePollers, tileCache }                          from './tiles'
import { startSpotifyPoller, spotifyState, setSpotifyMediaPath } from './spotify'
import { startTimers, handleCounterPress, handleStopwatchPress, handleCountdownPress } from './timers'
import { startCrons, stopCrons }                               from './cron'
import { startAutoProfile, stopAutoProfile, recordManualNavigation } from './auto-profile'
import { handleVoiceCommand }                                  from './voice'
import type { Config, PluginMeta, PluginAction, PluginStatus, ServerInfo, PluginLogEntry } from '../shared/types'

const PLUGIN_RUNNER = path.join(__dirname, 'plugin-runner.js')

let APP_VERSION = '0.0.0'

const MAX_RETRIES     = 3
const RETRY_DELAYS_MS = [2000, 4000, 8000]

interface PendingCall {
  resolve: () => void
  reject:  (err: Error) => void
}

interface PluginWorker {
  worker:  Worker
  pending: Map<number, PendingCall>
  callId:  number
}

let config:          Config | null     = null
let configFilePath:  string | null     = null
let licenseFilePath: string | null     = null
let loadedLicenseKey: string | null    = null
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
const pluginRetries: Record<string, number> = {}
const pluginLogs = new Map<string, PluginLogEntry[]>()
const PLUGIN_LOG_MAX = 200

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

function resolvePluginMain(dir: string): string {
  try {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { main?: string }
      if (pkg.main) return path.resolve(dir, pkg.main)
    }
  } catch { /* fall through to default */ }
  return path.join(dir, 'index.js')
}

function setPluginStatus(pluginId: string, status: PluginStatus, error?: string): void {
  const meta = pluginsMeta.find(m => m.id === pluginId)
  if (!meta) return
  meta._status = status
  if (error !== undefined) meta._error = error
  else delete meta._error
}

function spawnPluginWorker(manifest: { id: string; name?: string; version?: string }, dir: string): Promise<string[]> {
  const pending = new Map<number, PendingCall>()
  const worker  = new Worker(PLUGIN_RUNNER, {
    workerData: {
      pluginId:   manifest.id,
      pluginPath: resolvePluginMain(dir),
      dataDir:    pluginsDataDir ?? dir
    }
  })

  const pw: PluginWorker = { worker, pending, callId: 0 }
  pluginWorkers[manifest.id] = pw

  type WorkerMsg = { type: string; id: number; error?: string; payload?: unknown; level?: 'info' | 'warn' | 'error'; args?: unknown[]; ts?: number; actions?: string[]; stack?: string }

  worker.on('message', (msg: WorkerMsg) => {
    if (msg.type === 'result') {
      const cb = pending.get(msg.id)
      if (cb) { pending.delete(msg.id); if (msg.error) { cb.reject(new Error(msg.error)) } else { cb.resolve() } }
    } else if (msg.type === 'broadcast') {
      broadcast(msg.payload as Record<string, unknown>)
    } else if (msg.type === 'pluginLog') {
      const entry: PluginLogEntry = {
        pluginId: manifest.id,
        level:    msg.level ?? 'info',
        args:     msg.args ?? [],
        ts:       msg.ts ?? Date.now(),
        stack:    msg.stack
      }
      const buf = pluginLogs.get(manifest.id) ?? []
      buf.push(entry)
      if (buf.length > PLUGIN_LOG_MAX) buf.splice(0, buf.length - PLUGIN_LOG_MAX)
      pluginLogs.set(manifest.id, buf)
    }
  })

  worker.on('error', (err) => console.error(`Plugin "${manifest.id}" worker error:`, err.message))

  worker.on('exit', (code) => {
    delete pluginWorkers[manifest.id]
    if (code === 0) {
      pluginLogs.delete(manifest.id)
      pluginRetries[manifest.id] = 0
      return
    }
    console.error(`Plugin "${manifest.id}" worker exited (code ${code})`)
    const retries = pluginRetries[manifest.id] ?? 0
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[retries] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!
      pluginRetries[manifest.id] = retries + 1
      setPluginStatus(manifest.id, 'restarting')
      console.log(`Plugin "${manifest.id}" restarting in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`)
      setTimeout(() => {
        spawnPluginWorker(manifest, dir).then(actions => {
          const VALID_KEY = /^[a-zA-Z0-9._-]+$/
          for (const key of actions) {
            if (!VALID_KEY.test(key)) continue
            pluginsMap[key] = makeActionCaller(manifest.id, key)
          }
        }).catch(err => {
          console.error(`Plugin "${manifest.id}" restart failed:`, (err as Error).message)
          setPluginStatus(manifest.id, 'failed', (err as Error).message)
        })
      }, delay)
    } else {
      pluginRetries[manifest.id] = 0
      setPluginStatus(manifest.id, 'failed', `Plugin crashed after ${MAX_RETRIES} restart attempts`)
      console.error(`Plugin "${manifest.id}" failed permanently after ${MAX_RETRIES} restarts`)
    }
  })

  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {})
      reject(new Error('Plugin startup timeout'))
    }, 5000)

    worker.once('message', (msg: { type: string; actions?: string[]; error?: string }) => {
      if (msg.type === 'ready') {
        clearTimeout(timer)
        setPluginStatus(manifest.id, 'running')
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
        author?: string; icon?: string; _local?: boolean; actions?: PluginAction[]
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
        actions:     manifest.actions ?? [],
        _status:     'loading'
      })

      // Spawn worker — resolves once the plugin reports ready
      spawnPluginWorker(manifest, dir).then(actions => {
        const VALID_KEY = /^[a-zA-Z0-9._-]+$/
        for (const key of actions) {
          if (!VALID_KEY.test(key)) { console.warn(`Plugin "${manifest.id}" skipped invalid action key: "${key}"`); continue }
          if (pluginsMap[key]) console.warn(`Plugin conflict: "${key}" already registered — "${manifest.id}" overrides it`)
          pluginsMap[key] = makeActionCaller(manifest.id, key)
        }
        console.log(`Plugin loaded: ${manifest.name} v${manifest.version ?? '?'} (${actions.length} actions)`)
      }).catch(err => {
        console.error(`Plugin "${manifest.id}" failed to start:`, (err as Error).message)
        setPluginStatus(manifest.id, 'failed', (err as Error).message)
      })
    } catch (err) {
      console.error(`Plugin "${name}" failed to load:`, (err as Error).message)
    }
  }
}

function getPlugins(): PluginMeta[] { return pluginsMeta }
function reloadPlugins(pluginsDir: string): void { loadPlugins(pluginsDir); broadcast({ type: MESSAGE_TYPES.PLUGINS_RELOAD }) }

function getPluginLogs(pluginId?: string): PluginLogEntry[] {
  if (pluginId !== undefined) {
    return pluginLogs.get(pluginId) ?? []
  }
  const all: PluginLogEntry[] = []
  for (const entries of pluginLogs.values()) all.push(...entries)
  return all.sort((a, b) => a.ts - b.ts)
}

function broadcast(msg: Record<string, unknown>): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}

// ── Press / Slide ──────────────────────────────────────
function handlePress(pageId: string, compId: string, hold = false, doubletap = false): void {
  if (!config) return
  const page = config.pages.find(p => p.id === pageId)
  const comp = page?.components.find(c => c.id === compId)
  if (comp?.componentType === 'counter') {
    handleCounterPress(pageId, compId, hold, doubletap, comp, broadcast)
    return
  }
  if (comp?.componentType === 'stopwatch') {
    handleStopwatchPress(pageId, compId, hold, comp, broadcast)
    return
  }
  if (comp?.componentType === 'countdown') {
    handleCountdownPress(pageId, compId, hold, comp, broadcast)
    return
  }
  if (comp?.componentType === COMPONENT_TYPES.TILE && comp.tileTapCmd) {
    const SHELL_INJECT = /`|\$\(/
    if (SHELL_INJECT.test(comp.tileTapCmd)) {
      console.error(`Tile tap "${pageId}:${compId}" rejected: tileTapCmd contains command substitution`)
    } else {
      executeCommand(comp.tileTapCmd)
    }
    return
  }
  if (!comp?.action) return

  const action = (hold && comp.holdAction) ? comp.holdAction : comp.action

  switch (action.type) {
    case ACTION_TYPES.BUILTIN:  executeBuiltin(action.key); break
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
      action.commands.forEach((cmd, idx) => setTimeout(() => executeCommand(cmd), idx * (action.delay ?? TIMINGS.SEQUENCE_DEFAULT_MS)))
      break
    case ACTION_TYPES.PAGE:
      recordManualNavigation()
      broadcast({ type: MESSAGE_TYPES.NAVIGATE, pageId: action.pageId })
      break
    case ACTION_TYPES.PLUGIN: {
      const fn = pluginsMap[action.pluginKey]
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
    case 'webhook': {
      const rawUrl = action.url
      if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
        console.error(`Webhook action rejected: URL must start with http:// or https:// (got "${rawUrl}")`)
        break
      }
      try {
        const parsedUrl = new URL(rawUrl)
        const method    = action.method ?? 'POST'
        const body      = action.body ?? ''
        const headers   = action.headers ?? {}
        const transport = parsedUrl.protocol === 'https:' ? https : http
        const reqHeaders: Record<string, string> = { ...headers }
        if ((method === 'POST' || method === 'PUT') && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json'
        }
        if ((method === 'POST' || method === 'PUT') && !reqHeaders['Content-Length']) {
          reqHeaders['Content-Length'] = String(Buffer.byteLength(body))
        }
        const req = transport.request(
          { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname + parsedUrl.search, method, headers: reqHeaders },
          (res) => { res.resume() }
        )
        req.on('error', (err) => console.error(`Webhook request failed for "${rawUrl}":`, err.message))
        if (method === 'POST' || method === 'PUT') req.write(body)
        req.end()
      } catch (err) {
        console.error(`Webhook action error for "${rawUrl}":`, (err as Error).message)
      }
      break
    }
    case 'conditional': {
      let conditionMet = false
      if (action.condition === 'toggle') {
        conditionMet = !!toggleStates[action.key]
      } else if (action.condition === 'tile') {
        const tileValue = tileCache[action.key] ?? ''
        conditionMet = action.value !== undefined ? tileValue.includes(action.value) : tileValue.length > 0
      }
      const nextAction = conditionMet ? action.then : action.else
      if (nextAction) {
        const savedAction = comp?.action
        if (comp) {
          comp.action = nextAction
          handlePress(pageId, compId, false)
          comp.action = savedAction
        }
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
      let cmd = a.command.replace(/{value}/g, val)
      if (comp.infiniteScroll) {
        const last  = slideLastValues[key] ?? value
        const raw   = value - last
        slideLastValues[key] = value
        if (Math.abs(raw) > 15) break
        const delta = Math.round(raw)
        if (delta === 0) break
        cmd = a.command.replace(/{delta}/g, String(delta)).replace(/{value}/g, val)
      }
      executeCommand(cmd)
      break
    }
    case ACTION_TYPES.BUILTIN:  executeBuiltin(a.key); break
    case ACTION_TYPES.HOTKEY:   executeHotkey(a.combo); break
    case ACTION_TYPES.SEQUENCE:
      a.commands.forEach((cmd, idx) =>
        setTimeout(() => executeCommand(cmd.replace(/{value}/g, val)), idx * (a.delay ?? TIMINGS.SEQUENCE_DEFAULT_MS))
      ); break
    case ACTION_TYPES.PLUGIN: {
      const fn = pluginsMap[a.pluginKey]
      if (fn) {
        fn({ ...(a.params ?? {}), value }).catch(err => console.error(`Plugin slide "${a.pluginKey}" error:`, (err as Error).message))
      } else {
        console.warn('Unknown plugin action:', a.pluginKey)
      }
      break
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
  startTilePollers(config, broadcast)
  startSpotifyPoller(config, broadcast)
  startTimers(config, broadcast, (action, pid, cid) => {
    const page = config!.pages.find(p => p.id === pid)
    const comp = page?.components.find(c => c.id === cid)
    if (!comp) return
    const savedAction = comp.action
    comp.action = action
    handlePress(pid, cid, false)
    comp.action = savedAction
  })
  startCrons(() => config!, handlePress)
  startAutoProfile(() => config!, (pageId) => broadcast({ type: MESSAGE_TYPES.NAVIGATE, pageId }))
}

// ── Server start ───────────────────────────────────────
interface StartPaths {
  pwaPath?:     string
  mediaPath?:   string
  certDir?:     string
  pluginsPath?: string
  configPath?:  string
  appVersion?:  string
}

type EventFn = (event: Record<string, unknown>) => void

export async function start(onEvent: EventFn, port = 3000, paths: StartPaths = {}): Promise<ServerInfo> {
  const pwaPath     = paths.pwaPath     ?? path.join(__dirname, '../../pwa')
  const mediaPath   = paths.mediaPath   ?? path.join(__dirname, '../../media')
  const certDir     = paths.certDir     ?? path.join(__dirname, '../../.cert')
  const pluginsDir  = paths.pluginsPath ?? path.join(__dirname, '../../plugins')
  configFilePath    = paths.configPath  ?? path.join(__dirname, '../../config.json')
  licenseFilePath   = path.join(path.dirname(configFilePath), 'license.key')
  loadedLicenseKey  = loadLicense(licenseFilePath)
  if (paths.appVersion) APP_VERSION = paths.appVersion
  config = loadConfig(configFilePath)

  // Generate webhook secret on first start
  if (!config.webhook) {
    config.webhook = { enabled: false, secret: crypto.randomBytes(24).toString('hex') }
    saveConfig(configFilePath, config)
  }

  pluginsDataDir = path.join(path.dirname(pluginsDir), 'plugins-data')
  fs.mkdirSync(mediaPath,      { recursive: true })
  fs.mkdirSync(pluginsDir,     { recursive: true })
  fs.mkdirSync(pluginsDataDir, { recursive: true })
  setSpotifyMediaPath(mediaPath)
  loadPlugins(pluginsDir)

  // Check for plugin updates once per day (runs silently in background)
  const AUTO_UPDATE_INTERVAL = 24 * 60 * 60 * 1000
  setInterval(async () => {
    await autoUpdatePlugins(pluginsDir, APP_VERSION, (pluginId, newVersion) => {
      reloadPlugins(pluginsDir)
      broadcast({ type: MESSAGE_TYPES.PLUGINS_RELOAD, updatedPlugin: pluginId, newVersion })
    })
  }, AUTO_UPDATE_INTERVAL).unref()
  setTimeout(async () => {
    await autoUpdatePlugins(pluginsDir, APP_VERSION, (pluginId, newVersion) => {
      reloadPlugins(pluginsDir)
      broadcast({ type: MESSAGE_TYPES.PLUGINS_RELOAD, updatedPlugin: pluginId, newVersion })
    })
  }, 60 * 1000)  // first check 60s after startup

  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  const watcher = fs.watch(pluginsDir, () => {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      reloadPlugins(pluginsDir)
    }, 500)
  })
  watcher.unref()

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

  // Inbound webhook — POST /webhook/:secret/:pageId/:buttonId
  // Triggers a button press from external tools (Zapier, Home Assistant, etc.)
  // Secret must match config.webhook.secret; disabled by default.
  app.post('/webhook/:secret/:pageId/:buttonId', (req, res) => {
    const cfg = config
    if (!cfg?.webhook?.enabled) { res.status(404).end(); return }
    if (req.params['secret'] !== cfg.webhook.secret) { res.status(403).end(); return }
    const { pageId, buttonId } = req.params as Record<string, string>
    const page = cfg.pages.find(p => p.id === pageId)
    const comp = page?.components.find(c => c.id === buttonId)
    if (!comp) { res.status(404).json({ error: 'Button not found' }); return }
    handlePress(pageId, buttonId)
    res.json({ ok: true })
  })

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
        const event = JSON.parse(data.toString()) as { type: string; pageId: string; compId: string; hold?: boolean; doubletap?: boolean; value?: number; transcript?: string; voiceMode?: string; event?: string; dx?: number; dy?: number; button?: 1 | 2 | 3 }
        if (event.type === MESSAGE_TYPES.PRESS)         { handlePress(event.pageId, event.compId, event.hold ?? false, event.doubletap ?? false); onEvent(event as Record<string, unknown>) }
        if (event.type === MESSAGE_TYPES.SLIDE)         { handleSlide(event.pageId, event.compId, event.value ?? 0); onEvent(event as Record<string, unknown>) }
        if (event.type === MESSAGE_TYPES.VOICE_COMMAND) { handleVoiceCommand(event.transcript ?? '', event.pageId, event.compId, event.voiceMode ?? 'smart', config, broadcast, handlePress) }
        if (event.type === 'trackpad') {
          if (event.event === 'move')   moveMouse(event.dx ?? 0, event.dy ?? 0)
          if (event.event === 'click')  clickMouse(event.button ?? 1)
          if (event.event === 'scroll') scrollMouse(event.dy ?? 0)
        }
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

  startTilePollers(config, broadcast)
  startSpotifyPoller(config, broadcast)
  startTimers(config, broadcast, (action, pid, cid) => {
    const page = config!.pages.find(p => p.id === pid)
    const comp = page?.components.find(c => c.id === cid)
    if (!comp) return
    const savedAction = comp.action
    comp.action = action
    handlePress(pid, cid, false)
    comp.action = savedAction
  })
  startCrons(() => config!, handlePress)
  startAutoProfile(() => config!, (pageId) => broadcast({ type: MESSAGE_TYPES.NAVIGATE, pageId }))

  process.once('exit', () => { stopCrons(); stopAutoProfile() })

  return serverInfo
}

// ── MCP-callable functions ─────────────────────────────

function pressButton(pageId: string, compId: string, hold = false): void {
  handlePress(pageId, compId, hold)
}

function switchPage(pageId: string): void {
  broadcast({ type: MESSAGE_TYPES.NAVIGATE, pageId })
}

function getTileValue(pageId: string, tileId: string): string | null {
  return tileCache[`${pageId}:${tileId}`] ?? null
}

function createButton(opts: {
  pageId: string; label: string; icon?: string
  col: number; row: number; command?: string; color?: string
}): string {
  const page = config?.pages.find(p => p.id === opts.pageId)
  if (!page) throw new Error(`Page "${opts.pageId}" not found`)
  const id = `mcp-${Date.now()}`
  page.components.push({
    id, col: opts.col, row: opts.row, colSpan: 1, rowSpan: 1,
    componentType: 'button' as const,
    label: opts.label, icon: opts.icon ?? '', color: opts.color ?? '#1e293b',
    image: null,
    action: opts.command ? { type: 'command' as const, command: opts.command } : { type: 'builtin' as const, key: 'media.playPause' },
    holdAction: null,
  })
  saveConfig(configFilePath!, config!)
  broadcast({ type: MESSAGE_TYPES.CONFIG, config })
  return id
}

function updateButton(pageId: string, compId: string, updates: { label?: string; icon?: string; color?: string; command?: string }): void {
  const comp = config?.pages.find(p => p.id === pageId)?.components.find(c => c.id === compId)
  if (!comp) throw new Error(`Component "${compId}" not found`)
  if (updates.label   !== undefined) comp.label  = updates.label
  if (updates.icon    !== undefined) comp.icon   = updates.icon
  if (updates.color   !== undefined) comp.color  = updates.color
  if (updates.command !== undefined) comp.action = { type: 'command' as const, command: updates.command }
  saveConfig(configFilePath!, config!)
  broadcast({ type: MESSAGE_TYPES.CONFIG, config })
}

function deleteButton(pageId: string, compId: string): void {
  const page = config?.pages.find(p => p.id === pageId)
  if (!page) throw new Error(`Page "${pageId}" not found`)
  page.components = page.components.filter(c => c.id !== compId)
  saveConfig(configFilePath!, config!)
  broadcast({ type: MESSAGE_TYPES.CONFIG, config })
}

function getStatus(): Record<string, unknown> {
  return {
    connectedClients,
    pages:      config?.pages.length ?? 0,
    tileValues: tileCache,
    plugins:    pluginsMeta.map(p => p.id),
    version:    APP_VERSION,
  }
}

function isProUser(): boolean {
  if (!loadedLicenseKey) return false
  const secret = process.env['LICENSE_SECRET'] ?? ''
  if (!secret) return false
  return validateLicense(loadedLicenseKey, secret)
}

function validateLicenseKey(key: string): boolean {
  const secret = process.env['LICENSE_SECRET'] ?? ''
  if (!secret) return false
  if (!validateLicense(key, secret)) return false
  loadedLicenseKey = key
  if (licenseFilePath) saveLicense(licenseFilePath, key)
  return true
}

function getLicenseStatus(): { isPro: boolean; key: string | null } {
  return { isPro: isProUser(), key: loadedLicenseKey }
}

function getWebhookInfo(): { enabled: boolean; secret: string } | null {
  if (!config?.webhook) return null
  return { enabled: config.webhook.enabled, secret: config.webhook.secret }
}

function setWebhookEnabled(enabled: boolean): void {
  if (!config || !configFilePath) return
  if (!config.webhook) config.webhook = { enabled: false, secret: crypto.randomBytes(24).toString('hex') }
  config.webhook.enabled = enabled
  saveConfig(configFilePath, config)
}

export { getConfig, setConfig, getInfo, getPlugins, reloadPlugins, getPluginLogs, loadPlugins, autoUpdatePlugins, pressButton, switchPage, getTileValue, createButton, updateButton, deleteButton, getStatus, isProUser, validateLicenseKey, getLicenseStatus, getWebhookInfo, setWebhookEnabled, stopCrons, stopAutoProfile }
