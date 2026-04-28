const https    = require('https')
const WebSocket = require('ws')
const express  = require('express')
const path     = require('path')
const fs       = require('fs')
const { generateCert } = require('./cert')
const { executeCommand } = require('./keyboard')

const CONFIG_PATH = path.join(__dirname, '../../config.json')

const DEFAULT_CONFIG = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      slots: [
        { icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: 'command', command: 'playerctl previous' } },
        { icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: 'command', command: 'playerctl play-pause' } },
        { icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: 'command', command: 'playerctl next' } },
        { icon: '🔉', label: 'Vol -',      color: '#1e293b', action: { type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-' } },
        { icon: '🔊', label: 'Vol +',      color: '#1e293b', action: { type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+' } },
        { icon: '🎵', label: 'Spotify',    color: '#14532d', action: { type: 'command', command: 'spotify' } },
        null, null, null, null, null, null
      ]
    },
    {
      id: 'system',
      name: 'System',
      slots: [
        { icon: '🎙', label: 'Discord Mute',   color: '#1e293b', action: { type: 'command', command: 'WIN=$(xdotool search --name "Discord" | head -1); [ -n "$WIN" ] && { PREV=$(xdotool getactivewindow 2>/dev/null); xdotool windowfocus --sync "$WIN"; xdotool key ctrl+shift+m; [ -n "$PREV" ] && xdotool windowfocus "$PREV"; }' } },
        { icon: '🔇', label: 'Discord Deafen', color: '#1e293b', action: { type: 'command', command: 'WIN=$(xdotool search --name "Discord" | head -1); [ -n "$WIN" ] && { PREV=$(xdotool getactivewindow 2>/dev/null); xdotool windowfocus --sync "$WIN"; xdotool key ctrl+shift+d; [ -n "$PREV" ] && xdotool windowfocus "$PREV"; }' } },
        { icon: '◀',  label: 'Desktop ←',     color: '#1e293b', action: { type: 'command', command: 'xdotool key ctrl+super+Up' } },
        { icon: '▶',  label: 'Desktop →',     color: '#1e293b', action: { type: 'command', command: 'xdotool key ctrl+super+Down' } },
        { icon: '🔒', label: 'Lock',           color: '#3b1f1f', action: { type: 'command', command: 'xdg-screensaver lock' } },
        null, null, null, null, null, null, null
      ]
    }
  ]
}

let config       = loadConfig()
let toggleStates = {}
let serverInfo   = null
let wss          = null
let connectedClients = 0

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
  return DEFAULT_CONFIG
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
    case 'command':
      executeCommand(action.command)
      break

    case 'toggle': {
      const key = `${pageId}:${slotIndex}`
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
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  broadcast({ type: 'config', config })
}

async function start(onEvent, port = 3000) {
  const { key, cert, ip } = generateCert()

  const app = express()
  app.get('/cert.crt', (req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert')
    res.setHeader('Content-Disposition', 'attachment; filename="stream-deck.crt"')
    res.send(cert)
  })
  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.use(express.static(path.join(__dirname, '../../pwa')))

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
