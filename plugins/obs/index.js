'use strict'

const crypto = require('crypto')

module.exports = (sdk) => {
  const WebSocket = sdk.ws

  let obsWs        = null  // active WebSocket instance
  let obsReady     = false // true once Identified (op 2) received
  let reconnectTimer = null

  // ── Pending request map — requestId → { resolve, reject } ──────────────
  const pending = {}

  // ── Auth helper (OBS WS v5 HMAC-SHA256) ────────────────────────────────
  function buildAuth(password, salt, challenge) {
    const secret = crypto.createHash('sha256').update(password + salt).digest('base64')
    return crypto.createHash('sha256').update(secret + challenge).digest('base64')
  }

  // ── Send a request (op 6) and return a promise that resolves on op 7 ───
  function sendRequest(requestType, requestData) {
    return new Promise((resolve, reject) => {
      if (!obsWs || !obsReady || obsWs.readyState !== WebSocket.OPEN) {
        return reject(new Error('OBS WebSocket not connected'))
      }
      const requestId = Math.random().toString(36).slice(2)
      pending[requestId] = { resolve, reject }

      // Timeout individual requests after 8s to avoid memory leaks
      const t = setTimeout(() => {
        if (pending[requestId]) {
          delete pending[requestId]
          reject(new Error(`Request ${requestType} timed out`))
        }
      }, 8000)
      pending[requestId].timer = t

      obsWs.send(JSON.stringify({
        op: 6,
        d: { requestType, requestId, requestData: requestData || {} }
      }))
    })
  }

  // ── Core connect / reconnect logic ─────────────────────────────────────
  function connect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    const host     = sdk.storage.get('obsHost')     || 'localhost'
    const port     = sdk.storage.get('obsPort')     || 4455
    const password = sdk.storage.get('obsPassword') || ''

    sdk.log.info(`Connecting to OBS at ws://${host}:${port}`)

    let ws
    try {
      ws = new WebSocket(`ws://${host}:${port}`)
    } catch (err) {
      sdk.log.error('Failed to create WebSocket:', err.message)
      scheduleReconnect()
      return
    }

    ws.on('open', () => {
      sdk.log.info('OBS WebSocket open — waiting for Hello (op 0)')
    })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      // op 0 — Hello: server sends auth challenge (or none)
      if (msg.op === 0) {
        const auth = msg.d && msg.d.authentication
        const identify = {
          op: 1,
          d: {
            rpcVersion: 1,
            eventSubscriptions: 0,
            authentication: auth ? buildAuth(password, auth.salt, auth.challenge) : undefined
          }
        }
        ws.send(JSON.stringify(identify))
        return
      }

      // op 2 — Identified: connection fully established
      if (msg.op === 2) {
        obsWs    = ws
        obsReady = true
        sdk.log.info('OBS identified — ready')
        return
      }

      // op 5 — Event: ignore (we poll manually)
      if (msg.op === 5) return

      // op 7 — RequestResponse: resolve/reject pending promise
      if (msg.op === 7) {
        const d  = msg.d || {}
        const p  = pending[d.requestId]
        if (!p) return
        clearTimeout(p.timer)
        delete pending[d.requestId]
        if (d.requestStatus && d.requestStatus.result === false) {
          p.reject(new Error(`OBS error ${d.requestStatus.code}: ${d.requestStatus.comment || 'unknown'}`))
        } else {
          p.resolve(d.responseData || {})
        }
      }
    })

    ws.on('close', () => {
      sdk.log.warn('OBS WebSocket closed — will reconnect in 5s')
      obsWs    = null
      obsReady = false
      // Reject all in-flight requests
      for (const id of Object.keys(pending)) {
        clearTimeout(pending[id].timer)
        pending[id].reject(new Error('OBS connection closed'))
        delete pending[id]
      }
      scheduleReconnect()
    })

    ws.on('error', (err) => {
      sdk.log.error('OBS WebSocket error:', err.message)
      // 'close' will fire after error, which handles reconnect
    })
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 5000)
  }

  // ── Status poll every 3s ───────────────────────────────────────────────
  sdk.cron(3000, async () => {
    if (!obsReady) return
    try {
      const [stream, record, scene] = await Promise.all([
        sendRequest('GetStreamStatus'),
        sendRequest('GetRecordStatus'),
        sendRequest('GetCurrentProgramScene')
      ])

      const streaming  = stream.outputActive  ? 'LIVE'    : ''
      const recording  = record.outputActive  ? 'Rec'     : ''
      const sceneName  = (scene.currentProgramSceneName || 'Unknown').slice(0, 20)

      const parts = [streaming, recording, sceneName].filter(Boolean)
      const text  = parts.length > 1 ? parts.join(' | ') : (parts[0] || 'Offline')

      sdk.broadcast('obsStatus', { text, streaming: !!stream.outputActive, recording: !!record.outputActive, scene: sceneName })
    } catch {
      // OBS may not be running — suppress to avoid log spam
    }
  })

  // ── Cleanup on hot-reload ──────────────────────────────────────────────
  sdk.onReload(() => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (obsWs) { try { obsWs.terminate() } catch {} }
    obsWs    = null
    obsReady = false
  })

  // ── Start connecting ───────────────────────────────────────────────────
  connect()

  // ── Action handlers ────────────────────────────────────────────────────
  sdk.on('obs.toggleRecording', async () => {
    try {
      await sendRequest('ToggleRecord')
      sdk.log.info('ToggleRecord sent')
    } catch (err) {
      sdk.log.error('toggleRecording failed:', err.message)
    }
  })

  sdk.on('obs.toggleStream', async () => {
    try {
      await sendRequest('ToggleStream')
      sdk.log.info('ToggleStream sent')
    } catch (err) {
      sdk.log.error('toggleStream failed:', err.message)
    }
  })

  sdk.on('obs.switchScene', async (params) => {
    const scene = (params && params.scene) ? String(params.scene) : ''
    if (!scene) { sdk.log.warn('switchScene: no scene name provided'); return }
    try {
      await sendRequest('SetCurrentProgramScene', { sceneName: scene })
      sdk.log.info(`Switched to scene: ${scene}`)
    } catch (err) {
      sdk.log.error('switchScene failed:', err.message)
    }
  })

  sdk.on('obs.toggleMute', async (params) => {
    const source = (params && params.source) ? String(params.source) : ''
    if (!source) { sdk.log.warn('toggleMute: no source name provided'); return }
    try {
      await sendRequest('ToggleInputMute', { inputName: source })
      sdk.log.info(`Toggled mute on: ${source}`)
    } catch (err) {
      sdk.log.error('toggleMute failed:', err.message)
    }
  })

  sdk.on('obs.getStatus', async () => {
    if (!obsReady) {
      sdk.broadcast('obsStatus', { text: 'Offline', streaming: false, recording: false, scene: '' })
      return
    }
    try {
      const [stream, record, scene] = await Promise.all([
        sendRequest('GetStreamStatus'),
        sendRequest('GetRecordStatus'),
        sendRequest('GetCurrentProgramScene')
      ])
      const streaming = stream.outputActive ? 'LIVE' : ''
      const recording = record.outputActive ? 'Rec'  : ''
      const sceneName = (scene.currentProgramSceneName || 'Unknown').slice(0, 20)
      const parts     = [streaming, recording, sceneName].filter(Boolean)
      const text      = parts.length > 1 ? parts.join(' | ') : (parts[0] || 'Offline')

      sdk.broadcast('obsStatus', { text, streaming: !!stream.outputActive, recording: !!record.outputActive, scene: sceneName })
    } catch (err) {
      sdk.log.error('getStatus failed:', err.message)
      sdk.broadcast('obsStatus', { text: 'Offline', streaming: false, recording: false, scene: '' })
    }
  })
}
