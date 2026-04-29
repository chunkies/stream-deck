import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // ── Server unit tests — Node environment ──────────────
  {
    test: {
      name:        'server-unit',
      environment: 'node',
      include:     ['tests/unit/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['tests/unit/setup.js'],
    },
  },

  // ── Renderer tests — jsdom (mocked window.api + full HTML fixture) ──
  {
    test: {
      name:        'renderer-browser',
      environment: 'jsdom',
      include:     ['tests/browser/renderer/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['tests/browser/renderer/setup.ts'],
    },
  },

  // ── PWA tests — jsdom (mocked WebSocket + Haptic) ────
  {
    test: {
      name:        'pwa-browser',
      environment: 'jsdom',
      include:     ['tests/browser/pwa/**/*.test.{js,ts}'],
      globals:     true,
      setupFiles:  ['tests/browser/pwa/setup.ts'],
    },
  },
])
