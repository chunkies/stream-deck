// Note: circular imports with component modules are intentional —
// send / render are only called inside function bodies, never at module init.
import { state, dom }          from './state.js'
import { render }              from './render.js'
import { updateToggleBtn }     from './components/switch.js'
import { updateTile, flashTile, applyWidgetUpdate, updateTileFromEvent } from './components/tile.js'
import { showVoiceResult }     from './components/voice.js'
import type { ClientMessage, ServerMessage } from '../../electron/shared/types.js'

export function send(data: ClientMessage): void {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(data))
}

// iOS Safari leaves sockets stuck in CONNECTING with no onerror/onclose when
// the network process isn't ready yet (WebKit bug #228296, #247943).
// After this timeout, if still CONNECTING, we close and show idle so the user
// can tap Connect again.
export const ZOMBIE_TIMEOUT = 5000

// Monotonic generation counter. Every connect() call increments this.
// All handlers check their captured generation matches the current one —
// stale handlers from a previous socket are silently discarded.
let wsGen = 0

function showIdle(): void {
  dom.wsStatusEl.textContent        = 'Disconnected'
  dom.wsDotEl.className             = 'dot disconnected'
  dom.offlineEl.dataset.state       = 'idle'
  dom.offlineEl.classList.add('visible')
}

function showConnectingUI(): void {
  dom.wsStatusEl.textContent        = 'Connecting…'
  dom.wsDotEl.className             = 'dot disconnected'
  dom.offlineEl.dataset.state       = 'connecting'
  dom.offlineEl.classList.add('visible')
}

export function connect(): void {
  const gen = ++wsGen
  state.ws = new WebSocket(`wss://${location.hostname}:${location.port}`)

  let zombieGuard: ReturnType<typeof setTimeout> | null = null

  // Zombie-socket guard: iOS Safari can leave a WebSocket stuck in CONNECTING
  // forever with no events. Detect and fall back to idle so user can retry.
  zombieGuard = setTimeout(() => {
    if (wsGen === gen && state.ws?.readyState === WebSocket.CONNECTING) {
      state.ws.close()
      showIdle()
    }
  }, ZOMBIE_TIMEOUT)

  state.ws.onopen = () => {
    if (wsGen !== gen) return
    if (zombieGuard) { clearTimeout(zombieGuard); zombieGuard = null }
    dom.wsStatusEl.textContent = 'Connected'
    dom.wsDotEl.className      = 'dot connected'
    dom.offlineEl.classList.remove('visible')
  }

  state.ws.onclose = () => {
    if (wsGen !== gen) return
    if (zombieGuard) { clearTimeout(zombieGuard); zombieGuard = null }
    showIdle()
  }

  // onerror fires before onclose — also call showIdle() here so the idle
  // state is reached if onclose is skipped (WebKit bug #247943, Firefox Android).
  state.ws.onerror = () => {
    if (wsGen !== gen) return
    state.ws?.close()
    showIdle()
  }

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
      render()
      // Re-apply cached widget updates after grid re-render
      for (const [key, opts] of state.widgetCache.entries()) {
        applyWidgetUpdate(key, opts)
      }
    }
    if (msg.type === 'toggleState')   { state.toggleStates[msg.key] = msg.active; updateToggleBtn(msg.key, msg.active) }
    if (msg.type === 'tileUpdate')    { updateTile(msg.key, msg.text) }
    if (msg.type === 'voiceResult')   { showVoiceResult(msg.matched, msg.transcript) }
    if (msg.type === 'pluginEvent')   { updateTileFromEvent(msg.pluginId, msg.event, msg) }
    if (msg.type === 'navigate') {
      state.navStack       = []
      state.currentPages   = state.config!.pages
      const idx = state.config?.pages.findIndex(p => p.id === msg.pageId) ?? -1
      if (idx >= 0) { state.currentPageIdx = idx; render() }
    }
    const rawMsg = msg as unknown as Record<string, unknown>
    if (rawMsg['type'] === 'tileFlash') {
      flashTile(rawMsg['key'] as string, rawMsg['color'] as string, rawMsg['ms'] as number)
    }
    if (rawMsg['type'] === 'pluginsReloaded') { /* no-op: plugin tiles will refresh on next event */ }
    if (rawMsg['type'] === 'widgetUpdate') {
      const key    = rawMsg['key'] as string
      const label  = rawMsg['label'] as string | undefined
      const color  = rawMsg['color'] as string | undefined
      const icon   = rawMsg['icon']  as string | undefined
      const image  = rawMsg['image'] as string | null | undefined
      const badge  = rawMsg['badge'] as string | undefined
      const targets = rawMsg['targets'] as string[] | undefined
      state.widgetCache.set(key, { label, color, icon, image, badge })
      applyWidgetUpdate(key, { label, color, icon, image, badge }, targets)
    }
    if (rawMsg['type'] === 'widgetFlash') {
      flashTile(rawMsg['key'] as string, rawMsg['color'] as string, rawMsg['ms'] as number)
    }
  }
}

// Connect button: user explicitly initiates connection
document.getElementById('offline-connect-btn')!.addEventListener('click', () => {
  showConnectingUI()
  connect()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Explicitly close before iOS suspends the process.
    // Prevents the zombie OPEN socket on resume that silently drops all data.
    state.ws?.close()
  } else if (state.ws?.readyState !== WebSocket.OPEN) {
    // Return to idle so user can tap Connect when coming back to the app.
    showIdle()
  }
})
