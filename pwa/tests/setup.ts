import { vi, beforeEach } from 'vitest'

// Minimal PWA HTML
document.body.innerHTML = `
  <div class="app">
    <div class="top-bar">
      <button class="back-btn hidden" id="back-btn">‹</button>
      <div class="ws-indicator">
        <span class="dot disconnected" id="ws-dot"></span>
        <span id="ws-status">Connecting...</span>
      </div>
      <div id="page-name" class="page-name">—</div>
    </div>
    <div class="grid-wrap"><div class="grid" id="grid"></div></div>
    <div class="bottom-bar"><div class="page-dots" id="page-dots"></div></div>
  </div>
  <div class="offline-overlay" id="offline-overlay">
    <div class="offline-content">
      <div class="offline-title" id="offline-title">Connecting…</div>
      <button id="retry-btn">Retry now</button>
    </div>
  </div>
`

// Mock WebSocket
const mockWs = {
  readyState: 1,  // OPEN
  send:       vi.fn(),
  close:      vi.fn(),
  onopen:     null as any,
  onclose:    null as any,
  onerror:    null as any,
  onmessage:  null as any,
}

const MockWebSocket = vi.fn().mockImplementation(() => mockWs) as any
MockWebSocket.OPEN       = 1
MockWebSocket.CONNECTING = 0
MockWebSocket.CLOSING    = 2
MockWebSocket.CLOSED     = 3

vi.stubGlobal('WebSocket', MockWebSocket)

// Mock Haptic (global from haptic.js in production)
vi.stubGlobal('Haptic', {
  tap:       vi.fn(),
  hold:      vi.fn(),
  ratchet:   vi.fn(),
  success:   vi.fn(),
  error:     vi.fn(),
  listening: vi.fn(),
  double:    vi.fn(),
})

export { mockWs, MockWebSocket }

beforeEach(() => {
  vi.clearAllMocks()
  mockWs.readyState = 1
  mockWs.onopen     = null
  mockWs.onclose    = null
  mockWs.onerror    = null
  mockWs.onmessage  = null
})
