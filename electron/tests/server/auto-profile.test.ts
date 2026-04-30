import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let startAutoProfile: any, stopAutoProfile: any, recordManualNavigation: any
let mockExecSync: ReturnType<typeof vi.fn>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let originalExecSync: any

function reloadModule() {
  const distPath = _require.resolve('../../../dist/electron/server/auto-profile')
  delete _require.cache[distPath]
  const mod = _require('../../../dist/electron/server/auto-profile')
  startAutoProfile       = mod.startAutoProfile
  stopAutoProfile        = mod.stopAutoProfile
  recordManualNavigation = mod.recordManualNavigation
}

beforeEach(() => {
  vi.useFakeTimers()
  const cp = _require('child_process')
  originalExecSync = cp.execSync
  mockExecSync     = vi.fn().mockReturnValue(Buffer.from(''))
  cp.execSync      = mockExecSync
  reloadModule()
})

afterEach(() => {
  if (stopAutoProfile) stopAutoProfile()
  const cp = _require('child_process')
  cp.execSync = originalExecSync
  vi.useRealTimers()
})

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(pages: Array<{ id: string; autoProfile?: { windowClass?: string; windowTitle?: string } }>) {
  return {
    grid:  { cols: 3, rows: 4 },
    pages: pages.map(p => ({ ...p, name: p.id, components: [] })),
  }
}

/** Set up execSync to report a specific active window title + WM_CLASS. */
function mockWindow(title: string, wclass: string) {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === 'xdotool getactivewindow') return Buffer.from('99999')
    if (String(cmd).startsWith('xdotool getwindowname')) return Buffer.from(title)
    if (String(cmd).startsWith('xprop -id')) return Buffer.from(`WM_CLASS(STRING) = "${wclass}", "${wclass}"`)
    return Buffer.from('')
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('auto-profile: window class matching', () => {
  test('navigates when window class matches (case-insensitive substring)', () => {
    mockWindow('Some Title', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p1', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p1')
  })

  test('does not navigate when window class does not match', () => {
    mockWindow('Firefox', 'Firefox')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p2', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('auto-profile: window title matching', () => {
  test('navigates when window title matches (case-insensitive substring)', () => {
    mockWindow('Now Playing - Spotify', 'SomeOtherClass')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p3', autoProfile: { windowTitle: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p3')
  })
})

describe('auto-profile: AND logic', () => {
  test('does NOT navigate when only class matches but title does not', () => {
    mockWindow('WrongTitle', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p4', autoProfile: { windowClass: 'spotify', windowTitle: 'correct' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('navigates when both class and title match', () => {
    mockWindow('Spotify Premium', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p5', autoProfile: { windowClass: 'spotify', windowTitle: 'premium' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p5')
  })
})

describe('auto-profile: no match', () => {
  test('no navigation when no page matches', () => {
    mockWindow('Firefox', 'Firefox')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p6', autoProfile: { windowClass: 'chrome' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('page without autoProfile is skipped', () => {
    mockWindow('anything', 'anything')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p7' }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('does not navigate again for same page on second tick', () => {
    mockWindow('Spotify', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p8', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)   // first tick — navigates
    vi.advanceTimersByTime(2000)   // second tick — same page, skip
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})

describe('auto-profile: 30s lock', () => {
  test('manual navigation suppresses auto-profile within 30s', () => {
    mockWindow('Spotify', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p9', autoProfile: { windowClass: 'spotify' } }])
    recordManualNavigation()
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('lock expires after 30 seconds and auto-profile resumes', () => {
    mockWindow('Spotify', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p10', autoProfile: { windowClass: 'spotify' } }])
    recordManualNavigation()
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(29_000)
    expect(navigate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p10')
  })
})

describe('auto-profile: stop and error handling', () => {
  test('stopAutoProfile prevents further polls', () => {
    mockWindow('Spotify', 'Spotify')
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p11', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    stopAutoProfile()
    vi.advanceTimersByTime(10_000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('execSync failure is swallowed and causes no navigation', () => {
    mockExecSync.mockImplementation(() => { throw new Error('xdotool not found') })
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p12', autoProfile: { windowClass: 'anything' } }])
    expect(() => {
      startAutoProfile(() => cfg, navigate)
      vi.advanceTimersByTime(2000)
    }).not.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })
})
