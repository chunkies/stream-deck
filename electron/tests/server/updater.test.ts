import { describe, test, expect } from 'vitest'
import type { AppUpdateInfo } from '../../shared/types'

// ── normaliseUpdateInfo helper (mirrors main/index.ts logic) ──────────────────
// Isolated here so the mapping logic is independently testable without Electron.

function normaliseUpdateInfo(raw: {
  version:      string
  releaseDate:  string
  releaseName?: string | null
  releaseNotes?: string | string[] | null
}): AppUpdateInfo {
  return {
    version:      raw.version,
    releaseDate:  raw.releaseDate,
    releaseName:  typeof raw.releaseName  === 'string' ? raw.releaseName  : undefined,
    releaseNotes: typeof raw.releaseNotes === 'string' ? raw.releaseNotes : undefined,
  }
}

describe('normaliseUpdateInfo', () => {
  test('maps basic fields through unchanged', () => {
    const result = normaliseUpdateInfo({ version: '1.2.3', releaseDate: '2026-05-01T00:00:00.000Z' })
    expect(result.version).toBe('1.2.3')
    expect(result.releaseDate).toBe('2026-05-01T00:00:00.000Z')
  })

  test('includes releaseName when it is a string', () => {
    const result = normaliseUpdateInfo({ version: '1.0.0', releaseDate: '', releaseName: 'v1.0.0' })
    expect(result.releaseName).toBe('v1.0.0')
  })

  test('strips releaseName when null', () => {
    const result = normaliseUpdateInfo({ version: '1.0.0', releaseDate: '', releaseName: null })
    expect(result.releaseName).toBeUndefined()
  })

  test('includes releaseNotes when it is a plain string', () => {
    const result = normaliseUpdateInfo({ version: '1.0.0', releaseDate: '', releaseNotes: '## Changes\n- fix stuff' })
    expect(result.releaseNotes).toBe('## Changes\n- fix stuff')
  })

  test('strips releaseNotes when it is an array (structured format)', () => {
    const result = normaliseUpdateInfo({ version: '1.0.0', releaseDate: '', releaseNotes: ['note1', 'note2'] })
    expect(result.releaseNotes).toBeUndefined()
  })

  test('strips releaseNotes when null', () => {
    const result = normaliseUpdateInfo({ version: '1.0.0', releaseDate: '', releaseNotes: null })
    expect(result.releaseNotes).toBeUndefined()
  })
})

// ── IPC handler logic — check-app-update ─────────────────────────────────────
// The real handler calls autoUpdater.checkForUpdates(). We test the branching:
//   • returns null when checkForUpdates resolves to null/undefined (no update)
//   • returns normalised AppUpdateInfo when an update is found
//   • returns null when checkForUpdates throws (network failure, etc.)

describe('check-app-update handler logic', () => {
  async function simulateHandler(
    checkResult: unknown,
    shouldThrow = false
  ): Promise<AppUpdateInfo | null> {
    try {
      const result = shouldThrow
        ? (() => { throw new Error('network error') })()
        : checkResult as { updateInfo: { version: string; releaseDate: string; releaseName?: string; releaseNotes?: string } } | null
      if (!result) return null
      const info = result.updateInfo
      return normaliseUpdateInfo(info)
    } catch { return null }
  }

  test('returns null when no update available', async () => {
    expect(await simulateHandler(null)).toBeNull()
  })

  test('returns null on network error', async () => {
    expect(await simulateHandler(null, true)).toBeNull()
  })

  test('returns AppUpdateInfo when update is available', async () => {
    const result = await simulateHandler({
      updateInfo: { version: '2.0.0', releaseDate: '2026-06-01T00:00:00.000Z', releaseName: 'v2.0.0' }
    })
    expect(result).not.toBeNull()
    expect(result!.version).toBe('2.0.0')
    expect(result!.releaseName).toBe('v2.0.0')
  })
})

// ── Auto-updater event payload shape ─────────────────────────────────────────
describe('update event payloads', () => {
  test('update-available payload satisfies AppUpdateInfo shape', () => {
    const raw = { version: '1.5.0', releaseDate: '2026-05-15T00:00:00.000Z', releaseName: 'v1.5.0', releaseNotes: '- New feature' }
    const payload: AppUpdateInfo = normaliseUpdateInfo(raw)
    expect(payload).toMatchObject({ version: '1.5.0', releaseName: 'v1.5.0', releaseNotes: '- New feature' })
  })

  test('update-downloaded payload satisfies AppUpdateInfo shape', () => {
    const raw = { version: '1.5.0', releaseDate: '2026-05-15T00:00:00.000Z' }
    const payload: AppUpdateInfo = normaliseUpdateInfo(raw)
    expect(payload.version).toBe('1.5.0')
    expect(payload.releaseName).toBeUndefined()
  })
})
