import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // ── Server unit tests — Node environment ──────────────
  {
    test: {
      name:        'server-unit',
      environment: 'node',
      include:     ['electron/tests/server/**/*.test.ts'],
      globals:     true,
      setupFiles:  ['electron/tests/setup.ts'],
      coverage:    { provider: 'v8', reporter: ['text', 'html', 'lcov'] },
    },
  },

  // ── Renderer tests — jsdom (mocked window.api + full HTML fixture) ──
  {
    test: {
      name:        'renderer-browser',
      environment: 'jsdom',
      include:     ['electron/tests/renderer/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['electron/tests/renderer/setup.ts'],
      coverage:    { provider: 'v8', reporter: ['text', 'html', 'lcov'] },
    },
  },

  // ── PWA tests — jsdom (mocked WebSocket + Haptic) ────
  {
    test: {
      name:        'pwa-browser',
      environment: 'jsdom',
      include:     ['pwa/tests/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['pwa/tests/setup.ts'],
      coverage:    { provider: 'v8', reporter: ['text', 'html', 'lcov'] },
    },
  },
])
