import { vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load the full renderer HTML so all getElementById calls resolve correctly
const html = readFileSync(resolve(__dirname, '../../../src/renderer/index.html'), 'utf8')
// Strip script/link tags — jsdom doesn't need them, and Vite paths won't resolve
document.documentElement.innerHTML = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '')

// Mock window.api (Electron IPC bridge)
const mockConfig = {
  grid: { cols: 3, rows: 4 },
  pages: [{ id: 'p1', name: 'Page 1', components: [] }]
}

vi.stubGlobal('api', {
  getConfig:      vi.fn().mockResolvedValue(structuredClone(mockConfig)),
  setConfig:      vi.fn().mockResolvedValue(undefined),
  getServerInfo:  vi.fn().mockResolvedValue({ ip: '192.168.1.1', port: 3000, url: 'https://192.168.1.1:3000', qr: '', mode: 'self-signed' }),
  uploadMedia:    vi.fn().mockResolvedValue('/media/test.jpg'),
  getPlugins:     vi.fn().mockResolvedValue([]),
  getAutostart:   vi.fn().mockResolvedValue(false),
  setAutostart:   vi.fn(),
  onDeckEvent:    vi.fn(),
  onServerReady:  vi.fn(),
  exportConfig:   vi.fn(),
  importConfig:   vi.fn().mockResolvedValue({ ok: true, config: structuredClone(mockConfig) }),
  openMarketplace:vi.fn(),
  reloadPlugins:  vi.fn().mockResolvedValue([]),
})

// Reset state between tests so modules don't bleed into each other
beforeEach(() => {
  vi.clearAllMocks()
  // Re-stub with fresh config each test
  window.api.getConfig.mockResolvedValue(structuredClone(mockConfig))
  window.api.importConfig.mockResolvedValue({ ok: true, config: structuredClone(mockConfig) })
})
