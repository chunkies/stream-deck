import { connect } from './ws.js'
import { goBack }  from './components/folder.js'
import { loadTheme, setTheme } from './theme.js'
import './swipe.js'  // registers touch event listeners as a side effect

// ── Theme init ──────────────────────────────────────────
loadTheme()

// ── Settings sheet ──────────────────────────────────────
const settingsBtn   = document.getElementById('settings-btn')
const settingsSheet = document.getElementById('settings-sheet')
const sheetClose    = document.getElementById('settings-sheet-close')

function openSettings(): void {
  settingsSheet?.classList.add('open')
  settingsSheet?.removeAttribute('aria-hidden')
}

function closeSettings(): void {
  settingsSheet?.classList.remove('open')
  settingsSheet?.setAttribute('aria-hidden', 'true')
}

settingsBtn?.addEventListener('pointerdown', (e) => { e.stopPropagation(); openSettings() })
sheetClose?.addEventListener('pointerdown', closeSettings)
settingsSheet?.addEventListener('pointerdown', (e) => {
  if (e.target === settingsSheet) closeSettings()
})

document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    const name = btn.dataset['themeName']
    if (name) setTheme(name)
  })
})

document.getElementById('back-btn')?.addEventListener('pointerdown', () => { Haptic.tap(); goBack() })

navigator.wakeLock?.request('screen').catch(() => { /* wake lock not supported in this browser */ })

// Fullscreen lock — request on first touch so the gesture comes from user interaction
let fullscreenRequested = false
document.addEventListener('pointerdown', () => {
  if (fullscreenRequested) return
  fullscreenRequested = true
  document.documentElement.requestFullscreen?.()
    .catch(() => { /* fullscreen not supported or denied */ })
}, { once: false, passive: true })

// Install prompt — defer and show after 30 s of use
let deferredInstallPrompt: { prompt: () => Promise<void> } | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredInstallPrompt = e as unknown as { prompt: () => Promise<void> }
  setTimeout(() => {
    deferredInstallPrompt?.prompt().catch(() => { /* dismissed */ })
    deferredInstallPrompt = null
  }, 30_000)
})

connect()
