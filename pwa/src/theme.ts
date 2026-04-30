const VALID_THEMES = ['dark', 'oled', 'neon', 'minimal', 'terminal', 'ocean', 'sakura', 'forest'] as const
type ThemeName = (typeof VALID_THEMES)[number]

function isValidTheme(name: string): name is ThemeName {
  return (VALID_THEMES as readonly string[]).includes(name)
}

export function setTheme(name: string): void {
  const theme: ThemeName = isValidTheme(name) ? name : 'dark'
  document.documentElement.dataset['theme'] = theme
  localStorage.setItem('theme', theme)
  // Update active swatch indicator
  document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset['themeName'] === theme)
  })
}

export function loadTheme(): void {
  const saved = localStorage.getItem('theme') ?? 'dark'
  setTheme(saved)
}
