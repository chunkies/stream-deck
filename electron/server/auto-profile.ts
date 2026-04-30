import { execSync }  from 'child_process'
import { platform }  from 'os'
import type { Config } from '../shared/types'

const OS = platform()

// ── Window detection ───────────────────────────────────

interface ActiveWindow {
  title: string
  wclass: string
}

function getActiveWindow(): ActiveWindow {
  try {
    if (OS === 'linux') {
      const title  = execSync('xdotool getactivewindow getwindowname',      { timeout: 1000 }).toString().trim()
      const wclass = execSync('xdotool getactivewindow getwindowclassname', { timeout: 1000 }).toString().trim()
      return { title, wclass }
    }
    if (OS === 'darwin') {
      const name = execSync(
        `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
        { timeout: 1000 }
      ).toString().trim()
      return { title: name, wclass: name }
    }
    // Windows
    const name = execSync(
      `powershell -c "(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object CPU -desc | Select-Object -First 1).Name"`,
      { timeout: 2000 }
    ).toString().trim()
    return { title: name, wclass: name }
  } catch {
    return { title: '', wclass: '' }
  }
}

// ── Lock state ─────────────────────────────────────────

const LOCK_DURATION_MS = 30_000

let lastManualNav: number | null = null

/** Call this when the user manually navigates so auto-profile is suppressed for 30s. */
export function recordManualNavigation(): void {
  lastManualNav = Date.now()
}

function isLocked(): boolean {
  if (lastManualNav === null) return false
  return Date.now() - lastManualNav < LOCK_DURATION_MS
}

// ── Engine state ───────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null
let currentAutoPageId: string | null = null

// ── Matching ───────────────────────────────────────────

function windowMatchesPage(
  win: ActiveWindow,
  profile: { windowClass?: string; windowTitle?: string },
): boolean {
  const classOk  = profile.windowClass
    ? win.wclass.toLowerCase().includes(profile.windowClass.toLowerCase())
    : null
  const titleOk  = profile.windowTitle
    ? win.title.toLowerCase().includes(profile.windowTitle.toLowerCase())
    : null

  if (classOk === null && titleOk === null) return false   // no criteria set
  if (classOk !== null && titleOk !== null) return classOk && titleOk  // AND logic
  return classOk ?? titleOk ?? false
}

// ── Public API ─────────────────────────────────────────

export function startAutoProfile(
  getConfig: () => Config,
  navigateTo: (pageId: string) => void,
): void {
  if (pollInterval) clearInterval(pollInterval)

  pollInterval = setInterval(() => {
    if (isLocked()) return

    const config = getConfig()
    const win    = getActiveWindow()

    for (const page of config.pages) {
      if (!page.autoProfile) continue
      if (windowMatchesPage(win, page.autoProfile)) {
        if (page.id !== currentAutoPageId) {
          currentAutoPageId = page.id
          lastManualNav     = null   // reset lock when auto-profile switches
          navigateTo(page.id)
        }
        return
      }
    }
  }, 2000)
}

export function stopAutoProfile(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  currentAutoPageId = null
  lastManualNav     = null
}
