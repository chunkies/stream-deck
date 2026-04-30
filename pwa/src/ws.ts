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

const RETRY_DELAY   = 1000
// iOS Safari leaves sockets stuck in CONNECTING with no onerror/onclose when
// the network process isn't ready yet (WebKit bug #228296, #247943).
// After this timeout, if still CONNECTING, we close and retry.
export const ZOMBIE_TIMEOUT = 5000

// Monotonic generation counter. Every connect() call increments this.
// All handlers check their captured generation matches the current one —
// stale handlers from a previous socket are silently discarded, preventing
// them from scheduling spurious timers that break the in-flight connection.
let wsGen = 0

function reconnectNow(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
  connect()
}

export function connect(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }

  const gen = ++wsGen
  state.ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  let zombieGuard: ReturnType<typeof setTimeout> | null = null

  const showConnecting = (): void => {
    if (wsGen !== gen) return
    if (zombieGuard) { clearTimeout(zombieGuard); zombieGuard = null }
    dom.wsStatusEl.textContent     = 'Connecting…'
    dom.wsDotEl.className          = 'dot disconnected'
    dom.offlineTitleEl.textContent = 'Connecting…'
    dom.offlineEl.classList.add('visible')
    // Don't retry while hidden — visibilitychange will trigger reconnect on resume
    // with a delay that lets the iOS network process fully wake up first.
    if (!state.reconnectTimer && document.visibilityState !== 'hidden') {
      state.reconnectTimer = setTimeout(connect, RETRY_DELAY)
    }
  }

  // Zombie-socket guard: iOS Safari can leave a WebSocket stuck in CONNECTING
  // forever with no events. Detect and recover.
  zombieGuard = setTimeout(() => {
    if (wsGen === gen && state.ws?.readyState === WebSocket.CONNECTING) {
      state.ws.close()
      showConnecting()
    }
  }, ZOMBIE_TIMEOUT)

  state.ws.onopen = () => {
    if (wsGen !== gen) return
    if (zombieGuard) { clearTimeout(zombieGuard); zombieGuard = null }
    dom.wsStatusEl.textContent     = 'Connected'
    dom.wsDotEl.className          = 'dot connected'
    dom.offlineEl.classList.remove('visible')
  }

  state.ws.onclose = showConnecting

  // onerror fires before onclose — also call showConnecting() here so the retry
  // loop survives if onclose is skipped (WebKit bug #247943, Firefox Android).
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
  if (document.visibilityState === 'hidden') {
    // Explicitly close before iOS suspends the process.
    // Prevents the zombie OPEN socket on resume that silently drops all data.
    state.ws?.close()
  } else if (state.ws?.readyState !== WebSocket.OPEN) {
    // iOS network process needs ~1s to fully wake after resume.
    // Attempting new WebSocket() immediately races against it and silently
    // hangs in CONNECTING with no error events (WebKit bug #228296).
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null }
    state.reconnectTimer = setTimeout(connect, 1000)
  }
})
