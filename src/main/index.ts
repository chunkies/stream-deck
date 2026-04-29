// @ts-nocheck
'use strict'

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const path      = require('path')
const fs        = require('fs')
const os        = require('os')
const QRCode    = require('qrcode')

// Dynamic requires — Rollup does not bundle these; they resolve to out/server/ at runtime
const server    = require(path.join(__dirname, '../server/index'))
const installer = require(path.join(__dirname, '../server/plugin-installer'))

let mainWindow
let marketplaceWindow = null
let mediaPath
let pluginsPath
let tray = null

// Single-instance lock — prevents port 3000 conflict when app is launched twice
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Trust our own self-signed cert so the admin panel can load images from the local server
app.on('certificate-error', (event, webContents, url, error, cert, callback) => {
  event.preventDefault()
  callback(true)
})

// ── Tray icon (generated at runtime) ──────────────────
function makePNG(r, g, b, size = 16) {
  const { deflateSync } = require('zlib')
  const W = size, H = size
  const raw = Buffer.alloc((1 + W * 4) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0
    for (let x = 0; x < W; x++) {
      const o = y * (1 + W * 4) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
    }
  }
  const idat = deflateSync(raw)

  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1)
    table[i] = c >>> 0
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const t = Buffer.from(type, 'ascii')
    const cBuf = Buffer.alloc(4); cBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, cBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function createTray() {
  try {
    const icon = nativeImage.createFromBuffer(makePNG(0x7c, 0x3a, 0xed))
    tray = new Tray(icon)
    tray.setToolTip('MacroPad')
    tray.on('click',        () => { mainWindow?.show(); mainWindow?.focus() })
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show MacroPad', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
    ]))
  } catch (err) {
    console.error('Tray creation failed:', err.message)
  }
}

// ── Autostart ──────────────────────────────────────────
function getAutostart() {
  if (process.platform === 'linux') {
    return fs.existsSync(path.join(os.homedir(), '.config/autostart/macropad.desktop'))
  }
  return app.getLoginItemSettings().openAtLogin
}

function setAutostart(enable) {
  if (process.platform === 'linux') {
    const dir  = path.join(os.homedir(), '.config/autostart')
    const file = path.join(dir, 'macropad.desktop')
    if (enable) {
      const exec = app.isPackaged ? process.execPath : `"${process.execPath}" "${__dirname}"`
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=MacroPad\nExec=${exec}\nHidden=false\nX-GNOME-Autostart-enabled=true\n`)
    } else {
      try { fs.unlinkSync(file) } catch {}
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: enable })
  }
}

// ── Window ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MacroPad',
    backgroundColor: '#0f172a'
  })

  // Dev: Vite dev server; Prod: static file
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Minimize to tray on close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

async function buildServerPayload(info) {
  const url = `https://${info.host}:${info.port}`
  const qr  = await QRCode.toDataURL(url, { width: 180, margin: 2, color: { dark: '#e0e0e0', light: '#1a1a1a' } })
  return { ...info, url, qr }
}

async function sendServerReady(info) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('server-ready', await buildServerPayload(info))
}

// ── Init ───────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow()
  createTray()

  const userData   = app.getPath('userData')
  // Dev: pwa/ is two levels up from out/main/ — goes to repo root then into pwa/
  const pwaPath    = app.isPackaged ? path.join(process.resourcesPath, 'pwa') : path.join(__dirname, '../../pwa')
  const configPath = path.join(userData, 'config.json')
  const certDir    = path.join(userData, 'cert')
  mediaPath   = path.join(userData, 'media')
  pluginsPath = path.join(userData, 'plugins')
  fs.mkdirSync(mediaPath,   { recursive: true })
  fs.mkdirSync(pluginsPath, { recursive: true })

  let serverInfo  = null
  let windowReady = false

  mainWindow.webContents.on('did-finish-load', async () => {
    windowReady = true
    if (serverInfo) await sendServerReady(serverInfo)
  })

  serverInfo = await server.start(
    (event) => mainWindow?.webContents.send('deck-event', event),
    3000,
    { pwaPath, configPath, mediaPath, certDir, pluginsPath }
  )

  if (windowReady) await sendServerReady(serverInfo)
})

// ── Marketplace window ─────────────────────────────────
function openMarketplace() {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    marketplaceWindow.show(); marketplaceWindow.focus(); return
  }
  marketplaceWindow = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/marketplace.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Plugin Marketplace',
    backgroundColor: '#0f172a',
    parent: mainWindow,
    show: false
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    marketplaceWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/marketplace.html`)
  } else {
    marketplaceWindow.loadFile(path.join(__dirname, '../renderer/marketplace.html'))
  }

  marketplaceWindow.once('ready-to-show', () => marketplaceWindow.show())
  marketplaceWindow.on('closed', () => { marketplaceWindow = null })
}

// ── IPC ────────────────────────────────────────────────
ipcMain.handle('get-config',           ()           => server.getConfig())
ipcMain.handle('get-server-info',      async ()     => { const i = server.getInfo(); return i ? buildServerPayload(i) : null })
ipcMain.handle('set-config',           (_, cfg)     => server.setConfig(cfg))
ipcMain.handle('get-platform',         ()           => process.platform)
ipcMain.handle('get-autostart',        ()           => getAutostart())
ipcMain.handle('set-autostart',        (_, enable)  => setAutostart(enable))
ipcMain.handle('get-plugins',          ()           => server.getPlugins())
ipcMain.handle('reload-plugins',       ()           => { server.reloadPlugins(pluginsPath); return server.getPlugins() })
ipcMain.handle('open-marketplace',     ()           => openMarketplace())

ipcMain.handle('upload-media', (_, srcPath) => {
  const ext      = path.extname(srcPath)
  const filename = `${Date.now()}${ext}`
  const dest     = path.join(mediaPath, filename)
  fs.copyFileSync(srcPath, dest)
  return `/media/${filename}`
})

// ── Marketplace IPC ────────────────────────────────────
ipcMain.handle('mp:fetch-registry',  (_, force) => installer.fetchRegistry(force))
ipcMain.handle('mp:get-installed',   ()         => installer.getInstalledManifests(pluginsPath))
ipcMain.handle('mp:check-updates',   ()         => installer.checkUpdates(pluginsPath))
ipcMain.handle('mp:open-external',   (_, url)   => shell.openExternal(url))
ipcMain.handle('mp:open-plugins-dir',()         => shell.openPath(pluginsPath))
ipcMain.handle('mp:reload',          ()         => { server.reloadPlugins(pluginsPath); return server.getPlugins() })

ipcMain.handle('mp:install', async (event, pluginId, downloadUrl) => {
  const onProgress = (d) => { try { event.sender.send('mp:progress', d) } catch {} }
  const manifest = await installer.installPlugin(pluginId, downloadUrl, pluginsPath, onProgress)
  server.reloadPlugins(pluginsPath)
  return manifest
})

ipcMain.handle('mp:uninstall', (_, pluginId) => {
  installer.uninstallPlugin(pluginId, pluginsPath)
  server.reloadPlugins(pluginsPath)
})

// ── Config import / export ────────────────────────────
ipcMain.handle('export-config', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export layout',
    defaultPath: 'macropad-layout.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false }
  const cfg = server.getConfig()
  fs.writeFileSync(result.filePath, JSON.stringify(cfg, null, 2))
  return { ok: true }
})

ipcMain.handle('import-config', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import layout',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return { ok: false }
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')) } catch {
    return { ok: false, error: 'Invalid JSON file' }
  }
  if (!parsed.pages || !Array.isArray(parsed.pages)) return { ok: false, error: 'Not a valid layout file' }
  server.setConfig(parsed)
  return { ok: true, config: server.getConfig() }
})

ipcMain.handle('mp:load-local', async (event) => {
  const result = await dialog.showOpenDialog(marketplaceWindow || mainWindow, {
    title: 'Select plugin folder',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  const manifest = installer.loadLocalPlugin(result.filePaths[0], pluginsPath)
  server.reloadPlugins(pluginsPath)
  return manifest
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { app.isQuitting = true })
