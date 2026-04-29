// Note: circular imports with component modules are intentional —
// send / render are only called inside function bodies, never at module init.
import { state, dom }          from './state.js'
import { render }              from './render.js'
import { updateToggleBtn }     from './components/switch.js'
import { updateTile }          from './components/tile.js'
import { updateSpotifyTile }   from './components/spotify.js'
import { showVoiceResult }     from './components/voice.js'
import { updatePluginTile }    from './components/plugin-tile.js'

export function send(data) {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(data))
}

export function connect() {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
  state.ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  state.ws.onopen = () => {
    dom.wsStatusEl.textContent = 'Connected'
    dom.wsDotEl.className      = 'dot connected'
    dom.offlineEl.classList.remove('visible')
  }

  state.ws.onclose = () => {
    dom.wsStatusEl.textContent = 'Reconnecting…'
    dom.wsDotEl.className      = 'dot disconnected'
    dom.offlineEl.classList.add('visible')
    state.reconnectTimer = setTimeout(connect, 2500)
  }

  state.ws.onerror = () => state.ws.close()

  state.ws.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }

    if (msg.type === 'config') {
      state.config         = msg.config
      state.currentPages   = state.config.pages
      state.currentPageIdx = 0
      state.navStack       = []
      state.toggleStates   = {}
      render()
    }
    if (msg.type === 'toggleState')   { state.toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
    if (msg.type === 'tileUpdate')    { updateTile(msg.key, msg.text) }
    if (msg.type === 'spotifyUpdate') { updateSpotifyTile(msg) }
    if (msg.type === 'voiceResult')   { showVoiceResult(msg.matched, msg.transcript) }
    if (msg.type === 'pluginEvent')   { updatePluginTile(msg.pluginId, msg.event, msg) }
    if (msg.type === 'navigate') {
      state.navStack       = []
      state.currentPages   = state.config.pages
      const idx = state.config?.pages.findIndex(p => p.id === msg.pageId)
      if (idx >= 0) { state.currentPageIdx = idx; render() }
    }
  }
}
