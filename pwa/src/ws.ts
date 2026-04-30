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

const MIN_DELAY = 1000
const MAX_DELAY = 10000

function scheduleReconnect(): void {
  const delay = state.reconnectDelay
  state.reconnectDelay = Math.min(delay * 2, MAX_DELAY)
  state.reconnectTimer = setTimeout(connect, delay)
}

export function connect(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
  state.ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  state.ws.onopen = () => {
    state.reconnectDelay        = MIN_DELAY
    dom.wsStatusEl.textContent  = 'Connected'
    dom.wsDotEl.className       = 'dot connected'
    dom.offlineEl.classList.remove('visible')
  }

  state.ws.onclose = () => {
    dom.wsStatusEl.textContent  = 'Connecting…'
    dom.wsDotEl.className       = 'dot disconnected'
    dom.offlineTitleEl.textContent = 'Connecting…'
    dom.offlineEl.classList.add('visible')
    scheduleReconnect()
  }

  state.ws.onerror = () => state.ws!.close()

  state.ws.onmessage = (e: MessageEvent<string>) => {
    let msg: ServerMessage
    try { msg = JSON.parse(e.data) as ServerMessage } catch { console.warn('WS: malformed message', e.data); return }

    if (msg.type === 'config') {
      state.config         = msg.config
      state.currentPages   = state.config.pages
      state.currentPageIdx = 0
      state.navStack       = []
      state.toggleStates   = {}
      // Apply custom CSS injected from admin panel
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

dom.retryBtnEl.addEventListener('click', () => {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
  state.reconnectDelay = MIN_DELAY
  connect()
})
