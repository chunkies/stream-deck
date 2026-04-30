import { describe, test, expect, beforeEach } from 'vitest'

// Inject swatch buttons that theme.ts interacts with
function setupSwatches(): void {
  const container = document.createElement('div')
  container.innerHTML = `
    <button class="theme-swatch" data-theme-name="dark"></button>
    <button class="theme-swatch" data-theme-name="oled"></button>
    <button class="theme-swatch" data-theme-name="neon"></button>
    <button class="theme-swatch" data-theme-name="minimal"></button>
    <button class="theme-swatch" data-theme-name="terminal"></button>
    <button class="theme-swatch" data-theme-name="ocean"></button>
    <button class="theme-swatch" data-theme-name="sakura"></button>
    <button class="theme-swatch" data-theme-name="forest"></button>
  `
  document.body.appendChild(container)
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['theme']
  // Remove any swatch containers added by prior tests
  document.querySelectorAll('.theme-swatch').forEach(el => el.parentElement?.remove())
})

describe('loadTheme', () => {
  test('applies dark theme by default when localStorage is empty', async () => {
    setupSwatches()
    const { loadTheme } = await import('../src/theme.js')
    loadTheme()
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })

  test('applies saved theme from localStorage', async () => {
    localStorage.setItem('theme', 'neon')
    setupSwatches()
    const { loadTheme } = await import('../src/theme.js')
    loadTheme()
    expect(document.documentElement.dataset['theme']).toBe('neon')
  })

  test('falls back to dark when stored value is invalid', async () => {
    localStorage.setItem('theme', 'bogus-theme')
    setupSwatches()
    const { loadTheme } = await import('../src/theme.js')
    loadTheme()
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })
})

describe('setTheme', () => {
  test('sets data-theme attribute on documentElement', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    setTheme('oled')
    expect(document.documentElement.dataset['theme']).toBe('oled')
  })

  test('persists theme to localStorage', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    setTheme('minimal')
    expect(localStorage.getItem('theme')).toBe('minimal')
  })

  test('falls back to dark for unknown theme name', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    setTheme('unknown-theme')
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })

  test('marks the correct swatch button as active', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    setTheme('terminal')
    const activeSwatches = document.querySelectorAll('.theme-swatch.active')
    expect(activeSwatches).toHaveLength(1)
    expect((activeSwatches[0] as HTMLElement).dataset['themeName']).toBe('terminal')
  })

  test('removes active class from previously active swatch', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    setTheme('neon')
    setTheme('dark')
    const neonBtn = document.querySelector('[data-theme-name="neon"]')
    expect(neonBtn?.classList.contains('active')).toBe(false)
    const darkBtn = document.querySelector('[data-theme-name="dark"]')
    expect(darkBtn?.classList.contains('active')).toBe(true)
  })

  test('accepts all eight valid theme names', async () => {
    setupSwatches()
    const { setTheme } = await import('../src/theme.js')
    for (const name of ['dark', 'oled', 'neon', 'minimal', 'terminal', 'ocean', 'sakura', 'forest']) {
      setTheme(name)
      expect(document.documentElement.dataset['theme']).toBe(name)
    }
  })
})
