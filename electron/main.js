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

  let serverInfo  = null
  let windowReady = false

  mainWindow.webContents.on('did-finish-load', async () => {
    windowReady = true
    if (serverInfo) await sendServerReady(serverInfo)
  })

  serverInfo = await server.start((event) => {
    mainWindow?.webContents.send('deck-event', event)
  })

  if (windowReady) await sendServerReady(serverInfo)
})

ipcMain.handle('get-config',    ()         => server.getConfig())
ipcMain.handle('get-server-info', ()       => server.getInfo())
ipcMain.handle('set-config',    (_, cfg)   => server.setConfig(cfg))

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
