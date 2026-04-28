const { app, BrowserWindow, ipcMain } = require('electron')
const path   = require('path')
const QRCode = require('qrcode')
const server = require('./server/index')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Stream Deck',
    backgroundColor: '#0f172a'
  })
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'))
}

async function sendServerReady(info) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const url = `https://${info.ip}:${info.port}`
  const qr  = await QRCode.toDataURL(url, { width: 180, margin: 2, color: { dark: '#e0e0e0', light: '#1a1a1a' } })
  mainWindow.webContents.send('server-ready', { ...info, qr })
}

app.whenReady().then(async () => {
  createWindow()

  // Resolve paths correctly for both dev and packaged app
  const pwaPath = app.isPackaged
    ? path.join(process.resourcesPath, 'pwa')
    : path.join(__dirname, '../pwa')

  const configPath = path.join(app.getPath('userData'), 'config.json')

  let serverInfo  = null
  let windowReady = false

  mainWindow.webContents.on('did-finish-load', async () => {
    windowReady = true
    if (serverInfo) await sendServerReady(serverInfo)
  })

  serverInfo = await server.start(
    (event) => mainWindow?.webContents.send('deck-event', event),
    3000,
    { pwaPath, configPath }
  )

  if (windowReady) await sendServerReady(serverInfo)
})

ipcMain.handle('get-config',      ()       => server.getConfig())
ipcMain.handle('get-server-info', ()       => server.getInfo())
ipcMain.handle('set-config',      (_, cfg) => server.setConfig(cfg))
ipcMain.handle('get-platform',    ()       => process.platform)

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
