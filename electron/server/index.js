const https     = require('https')
const WebSocket = require('ws')
const express   = require('express')
const path      = require('path')
const fs        = require('fs')
const { generateCert }                      = require('./cert')
const { executeCommand, executeBuiltin }    = require('./keyboard')

const DEFAULT_CONFIG = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      slots: [
        { icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: 'builtin', key: 'media.previous'  } },
        { icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: 'builtin', key: 'media.playPause' } },
        { icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: 'builtin', key: 'media.next'      } },
        { icon: '🔉', label: 'Vol -',      color: '#1e293b', action: { type: 'builtin', key: 'media.volumeDown'} },
        { icon: '🔊', label: 'Vol +',      color: '#1e293b', action: { type: 'builtin', key: 'media.volumeUp'  } },
        { icon: '🔇', label: 'Mute',       color: '#1e293b', action: { type: 'builtin', key: 'media.mute'      } },
        { icon: '🔒', label: 'Lock',       color: '#3b1f1f', action: { type: 'builtin', key: 'system.lock'     } },
        { icon: '💤', label: 'Sleep',      color: '#1e293b', action: { type: 'builtin', key: 'system.sleep'    } },
        { icon: '📷', label: 'Screenshot', color: '#1e293b', action: { type: 'builtin', key: 'system.screenshot'} },
        null, null, null
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

function loadConfig(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {}
  saveConfig(filePath, DEFAULT_CONFIG)
  return structuredClone(DEFAULT_CONFIG)
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

function handlePress(pageId, slotIndex) {
  const page = config.pages.find(p => p.id === pageId)
  const slot = page?.slots[slotIndex]
  if (!slot?.action) return

  const { action } = slot

  switch (action.type) {
    case 'builtin':
      executeBuiltin(action.key)
      break

    case 'command':
      executeCommand(action.command)
      break

    case 'toggle': {
      const key  = `${pageId}:${slotIndex}`
      toggleStates[key] = !toggleStates[key]
      const active = toggleStates[key]
      executeCommand(active ? action.on : action.off)
      broadcast({ type: 'toggleState', key, active })
      break
    }

    case 'sequence':
      action.commands.forEach((cmd, i) => {
        setTimeout(() => executeCommand(cmd), i * (action.delay ?? 150))
      })
      break

    case 'page':
      break
  }
}

function getConfig() { return config }
function getInfo()   { return serverInfo }

function setConfig(newConfig) {
  config       = newConfig
  toggleStates = {}
  saveConfig(configFilePath, config)
  broadcast({ type: 'config', config })
}

async function start(onEvent, port = 3000, paths = {}) {
  const pwaPath  = paths.pwaPath  || path.join(__dirname, '../../pwa')
  configFilePath = paths.configPath || path.join(__dirname, '../../config.json')
  config = loadConfig(configFilePath)

  const { key, cert, ip } = generateCert()

  const app = express()
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

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString())
        if (event.type === 'press') {
          handlePress(event.pageId, event.slot)
          onEvent(event)
        }
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
  return serverInfo
}

module.exports = { start, getConfig, setConfig, getInfo }
