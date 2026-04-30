import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(__filename)

// ── Module-level state shared across tests ─────────────
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

  // Patch child_process.execSync before the module loads
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

// ── Helper ─────────────────────────────────────────────

function makeConfig(pages: Array<{ id: string; autoProfile?: { windowClass?: string; windowTitle?: string } }>) {
  return {
    grid:  { cols: 3, rows: 4 },
    pages: pages.map(p => ({ ...p, name: p.id, components: [] })),
  }
}

// ── Tests ──────────────────────────────────────────────

describe('auto-profile: window class matching', () => {
  test('navigates when window class matches (case-insensitive substring)', () => {
    // On Linux: first call = title, second call = class
    mockExecSync.mockReturnValueOnce(Buffer.from('Some Title')).mockReturnValueOnce(Buffer.from('Spotify'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p1', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p1')
  })

  test('does not navigate when window class does not match', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('Firefox')).mockReturnValueOnce(Buffer.from('Firefox'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p2', autoProfile: { windowClass: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('auto-profile: window title matching', () => {
  test('navigates when window title matches (case-insensitive substring)', () => {
    mockExecSync
      .mockReturnValueOnce(Buffer.from('Now Playing - Spotify'))   // title
      .mockReturnValueOnce(Buffer.from('SomeOtherClass'))           // class
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p3', autoProfile: { windowTitle: 'spotify' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p3')
  })
})

describe('auto-profile: AND logic', () => {
  test('does NOT navigate when only class matches but title does not', () => {
    mockExecSync
      .mockReturnValueOnce(Buffer.from('WrongTitle'))   // title
      .mockReturnValueOnce(Buffer.from('Spotify'))       // class
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p4', autoProfile: { windowClass: 'spotify', windowTitle: 'correct' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('navigates when both class and title match', () => {
    mockExecSync
      .mockReturnValueOnce(Buffer.from('Spotify Premium'))   // title
      .mockReturnValueOnce(Buffer.from('Spotify'))            // class
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p5', autoProfile: { windowClass: 'spotify', windowTitle: 'premium' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p5')
  })
})

describe('auto-profile: no match', () => {
  test('no navigation when no page matches', () => {
    mockExecSync.mockReturnValue(Buffer.from('Firefox'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p6', autoProfile: { windowClass: 'chrome' } }])
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('page without autoProfile is skipped', () => {
    mockExecSync.mockReturnValue(Buffer.from('anything'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p7' }])   // no autoProfile
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('does not navigate again for same page on second tick', () => {
    mockExecSync.mockReturnValue(Buffer.from('Spotify'))
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
    mockExecSync.mockReturnValue(Buffer.from('Spotify'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p9', autoProfile: { windowClass: 'spotify' } }])

    recordManualNavigation()   // set lock
    startAutoProfile(() => cfg, navigate)
    vi.advanceTimersByTime(2000)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('lock expires after 30 seconds and auto-profile resumes', () => {
    mockExecSync.mockReturnValue(Buffer.from('Spotify'))
    const navigate = vi.fn()
    const cfg = makeConfig([{ id: 'p10', autoProfile: { windowClass: 'spotify' } }])

    recordManualNavigation()
    startAutoProfile(() => cfg, navigate)

    // Advance to just before 30s expiry — still locked
    vi.advanceTimersByTime(29_000)
    expect(navigate).not.toHaveBeenCalled()

    // Advance past 30s — lock expired, auto-profile fires
    vi.advanceTimersByTime(2000)
    expect(navigate).toHaveBeenCalledWith('p10')
  })
})

describe('auto-profile: stop and error handling', () => {
  test('stopAutoProfile prevents further polls', () => {
    mockExecSync.mockReturnValue(Buffer.from('Spotify'))
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
