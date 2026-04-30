// Note: circular imports with component modules are intentional —
// send / render are only called inside function bodies, never at module init.
import { state, dom }          from './state.js'
import { render }              from './render.js'
import { updateToggleBtn }     from './components/switch.js'
import { updateTile }          from './components/tile.js'
import { updateSpotifyTile }   from './components/spotify.js'
import { showVoiceResult }     from './components/voice.js'
import { updatePluginTile }    from './components/plugin-tile.js'
import type { ClientMessage, ServerMessage } from '../../electron/shared/types.js'

export function send(data: ClientMessage): void {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(data))
}

const RETRY_DELAY = 1000

// Incremented on every connect() call. Handlers check their own generation
// before doing anything — stale handlers from a previous WebSocket instance
// that fires after a new one is already created are silently discarded.
// Without this, a slow-closing old socket schedules a spurious retry timer
// that then interrupts the in-flight new connection and causes a feedback loop.
let wsGen = 0

function reconnectNow(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
  connect()
}

export function connect(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }

  const gen = ++wsGen
  state.ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  state.ws.onopen = () => {
    if (wsGen !== gen) return
    dom.wsStatusEl.textContent     = 'Connected'
    dom.wsDotEl.className          = 'dot connected'
    dom.offlineEl.classList.remove('visible')
  }

  const showConnecting = (): void => {
    if (wsGen !== gen) return
    dom.wsStatusEl.textContent     = 'Connecting…'
    dom.wsDotEl.className          = 'dot disconnected'
    dom.offlineTitleEl.textContent = 'Connecting…'
    dom.offlineEl.classList.add('visible')
    if (!state.reconnectTimer) state.reconnectTimer = setTimeout(connect, RETRY_DELAY)
  }

  state.ws.onclose = showConnecting

  // onerror fires before onclose — schedule reconnect here too so the loop
  // survives if onclose is skipped (observed on Firefox Android and iOS Safari).
  state.ws.onerror = () => { state.ws?.close(); showConnecting() }

  state.ws.onmessage = (e: MessageEvent<string>) => {
    if (wsGen !== gen) return
    let msg: ServerMessage
    try { msg = JSON.parse(e.data) as ServerMessage } catch { console.warn('WS: malformed message', e.data); return }

    if (msg.type === 'config') {
      state.config         = msg.config
      state.currentPages   = state.config.pages
      state.currentPageIdx = 0
      state.navStack       = []
      state.toggleStates   = {}
      let customStyleEl = document.getElementById('custom-css') as HTMLStyleElement | null
      if (!customStyleEl) {
        customStyleEl = document.createElement('style')
        customStyleEl.id = 'custom-css'
        document.head.appendChild(customStyleEl)
      }
      customStyleEl.textContent = state.config.customCSS ?? ''
      render()
    }
    if (msg.type === 'toggleState')   { state.toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
    if (msg.type === 'tileUpdate')    { updateTile(msg.key, msg.text) }
    if (msg.type === 'spotifyUpdate') { updateSpotifyTile(msg) }
    if (msg.type === 'voiceResult')   { showVoiceResult(msg.matched, msg.transcript) }
    if (msg.type === 'pluginEvent')   { updatePluginTile(msg.pluginId, msg.event, msg) }
    if (msg.type === 'navigate') {
      state.navStack       = []
      state.currentPages   = state.config!.pages
      const idx = state.config?.pages.findIndex(p => p.id === msg.pageId) ?? -1
      if (idx >= 0) { state.currentPageIdx = idx; render() }
    }
  }
}

dom.offlineEl.addEventListener('pointerdown', reconnectNow)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.ws?.readyState !== WebSocket.OPEN) {
    reconnectNow()
  }
})
