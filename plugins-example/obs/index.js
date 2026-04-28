'use strict'

const crypto = require('crypto')

module.exports = (sdk) => {
  const WebSocket = sdk.ws
  let obsWs    = null
  let obsReady = false

  // ── OBS WebSocket v5 protocol ─────────────────────────
  function sendRequest(ws, requestType, requestData = {}) {
    const id = Math.random().toString(36).slice(2)
    ws.send(JSON.stringify({
      op: 6,
      d: { requestType, requestId: id, requestData }
    }))
    return id
  }

  function makeAuth(password, salt, challenge) {
    const secret = crypto.createHash('sha256').update(password + salt).digest('base64')
    return crypto.createHash('sha256').update(secret + challenge).digest('base64')
  }

  function connectOBS(host, port, password) {
    return new Promise((resolve, reject) => {
      if (obsWs) { try { obsWs.terminate() } catch {} }
      obsReady = false

      const ws = new WebSocket(`ws://${host}:${port}`)
      const timer = setTimeout(() => { ws.terminate(); reject(new Error('Connection timed out')) }, 6000)

      ws.on('open', () => sdk.log.info(`Connected to OBS at ${host}:${port}`))

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.op === 0) { // Hello
            const auth = msg.d.authentication
            ws.send(JSON.stringify({
              op: 1,
              d: {
                rpcVersion: 1,
                authentication: auth ? makeAuth(password || '', auth.salt, auth.challenge) : undefined,
                eventSubscriptions: 0
              }
            }))
          }

          if (msg.op === 2) { // Identified
            clearTimeout(timer)
            obsWs    = ws
            obsReady = true
            resolve(ws)
          }

          if (msg.op === 5) {} // Event — ignored
        } catch {}
      })

      ws.on('close',   () => { obsReady = false; obsWs = null })
      ws.on('error',   (err) => { clearTimeout(timer); reject(err) })
    })
  }

  async function getOBS() {
    if (obsWs && obsReady && obsWs.readyState === WebSocket.OPEN) return obsWs
    const host     = sdk.storage.get('host')
    const port     = sdk.storage.get('port') || 4455
    const password = sdk.storage.get('password') || ''
    if (!host) throw new Error('OBS not configured — add an "OBS Connect" button first')
    return connectOBS(host, port, password)
  }

  // ── Handlers ──────────────────────────────────────────
  return {
    'obs.connect': async ({ params }) => {
      const host     = params.host     || 'localhost'
      const port     = parseInt(params.port) || 4455
      const password = params.password || ''

      sdk.storage.set('host',     host)
      sdk.storage.set('port',     port)
      sdk.storage.set('password', password)

      await connectOBS(host, port, password)
      sdk.log.info('OBS connected and credentials saved')
    },

    'obs.switchScene': async ({ params }) => {
      const ws = await getOBS()
      sendRequest(ws, 'SetCurrentProgramScene', { sceneName: params.scene })
    },

    'obs.toggleRecording': async () => {
      const ws = await getOBS()
      sendRequest(ws, 'ToggleRecord')
    },

    'obs.toggleStreaming': async () => {
      const ws = await getOBS()
      sendRequest(ws, 'ToggleStream')
    },

    'obs.muteToggle': async ({ params }) => {
      const ws = await getOBS()
      sendRequest(ws, 'ToggleInputMute', { inputName: params.source })
    }
  }
}
