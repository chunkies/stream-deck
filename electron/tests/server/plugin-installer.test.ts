import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import AdmZip from 'adm-zip'
import fs   from 'fs'
import path from 'path'
import os   from 'os'

const mod = require('../../../dist/electron/server/plugin-installer')
const { semverGt, getInstalledManifests, installPlugin, validateManifest, autoUpdatePlugins, fetchRegistry } = mod

// ── semverGt ───────────────────────────────────────────
describe('semverGt', () => {
  test('higher major wins', () => {
    expect(semverGt('2.0.0', '1.9.9')).toBe(true)
    expect(semverGt('1.0.0', '2.0.0')).toBe(false)
  })

  test('higher minor wins when major equal', () => {
    expect(semverGt('1.10.0', '1.9.9')).toBe(true)  // string compare would fail this
    expect(semverGt('1.2.0', '1.10.0')).toBe(false)
  })

  test('higher patch wins when major.minor equal', () => {
    expect(semverGt('1.0.10', '1.0.9')).toBe(true)
    expect(semverGt('1.0.1', '1.0.2')).toBe(false)
  })

  test('equal versions return false', () => {
    expect(semverGt('1.2.3', '1.2.3')).toBe(false)
  })

  test('handles v-prefix', () => {
    expect(semverGt('v2.0.0', 'v1.0.0')).toBe(true)
  })

  test('handles missing/undefined versions', () => {
    expect(semverGt('1.0.0', undefined)).toBe(true)
    expect(semverGt(undefined, '1.0.0')).toBe(false)
  })
})

// ── getInstalledManifests ──────────────────────────────
describe('getInstalledManifests', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  test('returns empty array for missing dir', () => {
    expect(getInstalledManifests('/nonexistent/path')).toEqual([])
  })

  test('returns empty array for empty dir', () => {
    expect(getInstalledManifests(tmpDir)).toEqual([])
  })

  test('returns manifests for valid plugin dirs', () => {
    const pluginDir = path.join(tmpDir, 'my-plugin')
    fs.mkdirSync(pluginDir)
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'my-plugin', name: 'My Plugin', version: '1.0.0'
    }))

    const result = getInstalledManifests(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('my-plugin')
    expect(result[0].version).toBe('1.0.0')
    expect(result[0]._dir).toBe('my-plugin')
  })

  test('skips dirs without manifest.json', () => {
    fs.mkdirSync(path.join(tmpDir, 'no-manifest'))
    expect(getInstalledManifests(tmpDir)).toHaveLength(0)
  })

  test('skips files (non-directories)', () => {
    fs.writeFileSync(path.join(tmpDir, 'somefile.json'), '{}')
    expect(getInstalledManifests(tmpDir)).toHaveLength(0)
  })

  test('skips dirs with invalid JSON manifest', () => {
    const pluginDir = path.join(tmpDir, 'bad-plugin')
    fs.mkdirSync(pluginDir)
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), 'not json')
    expect(getInstalledManifests(tmpDir)).toHaveLength(0)
  })
})

// ── validateManifest ───────────────────────────────────
describe('validateManifest', () => {
  test('valid manifest passes without throwing', () => {
    expect(() => validateManifest(
      { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', actions: [{ key: 'my-plugin.doThing', label: 'Do Thing' }] },
      'my-plugin'
    )).not.toThrow()
  })

  test('missing id throws', () => {
    expect(() => validateManifest(
      { id: '', name: 'My Plugin', version: '1.0.0' },
      ''
    )).toThrow(/id/)
  })

  test('invalid id format throws', () => {
    expect(() => validateManifest(
      { id: 'My Plugin', name: 'My Plugin', version: '1.0.0' },
      'My Plugin'
    )).toThrow(/id/)
  })

  test('invalid version throws', () => {
    expect(() => validateManifest(
      { id: 'my-plugin', name: 'My Plugin', version: 'v1.0' },
      'my-plugin'
    )).toThrow(/version/)
  })

  test('action key not prefixed with plugin id throws', () => {
    expect(() => validateManifest(
      { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', actions: [{ key: 'other-plugin.doThing', label: 'Do Thing' }] },
      'my-plugin'
    )).toThrow(/action key/)
  })

  test('action key with invalid chars throws', () => {
    expect(() => validateManifest(
      { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', actions: [{ key: 'my-plugin.do thing!', label: 'Bad' }] },
      'my-plugin'
    )).toThrow(/action key/)
  })
})

// ── installPlugin — id mismatch guard ─────────────────
describe('installPlugin — manifest id validation', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('rejects when manifest.id does not match pluginId', async () => {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ id: 'other-id', name: 'Test', version: '1.0.0' })))
    zip.addFile('index.js', Buffer.from('module.exports = {}'))

    const zipPath = path.join(tmpDir, 'test.zip')
    zip.writeZip(zipPath)

    const origFetch = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      body: {
        getReader: () => {
          const buf = fs.readFileSync(zipPath)
          let done = false
          return {
            read: async () => {
              if (done) return { done: true }
              done = true
              return { done: false, value: new Uint8Array(buf) }
            }
          }
        }
      }
    })

    await expect(installPlugin('my-plugin', 'http://fake.url/test.zip', tmpDir))
      .rejects.toThrow('Plugin id mismatch')

    ;(globalThis as Record<string, unknown>).fetch = origFetch
  })
})

// ── autoUpdatePlugins ──────────────────────────────────
describe('autoUpdatePlugins', () => {
  let tmpDir: string
  let origFetch: typeof globalThis.fetch

  // Helper: build a minimal valid zip for a plugin
  function makePluginZip(pluginId: string, version: string): Buffer {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ id: pluginId, name: pluginId, version })))
    zip.addFile('index.js', Buffer.from('module.exports = {}'))
    const zipPath = path.join(tmpDir, `${pluginId}.zip`)
    zip.writeZip(zipPath)
    return fs.readFileSync(zipPath)
  }

  // Helper: create a mock fetch that returns the registry JSON on the first call,
  // then returns zip buffers for subsequent download calls.
  function makeFetch(registryJson: unknown, zipBuffers: Buffer[]): typeof globalThis.fetch {
    let callIndex = 0
    return async (_url: string | URL | Request) => {
      const idx = callIndex++
      if (idx === 0) {
        // Registry fetch
        const body = JSON.stringify(registryJson)
        return {
          ok:      true,
          json:    async () => JSON.parse(body),
          headers: { get: () => null },
          body:    null,
        } as unknown as Response
      }
      // Download fetch — serve zip buffers in order
      const buf = zipBuffers[idx - 1] ?? Buffer.alloc(0)
      let done = false
      return {
        ok:      true,
        headers: { get: () => String(buf.length) },
        body:    {
          getReader: () => ({
            read: async () => {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: new Uint8Array(buf) }
            }
          })
        }
      } as unknown as Response
    }
  }

  beforeEach(async () => {
    tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'au-test-'))
    origFetch = globalThis.fetch
    // Force-populate the registry cache with an empty registry so that
    // the cache time is set to "now". Each test then uses fake timers to
    // advance Date.now() past the 5-minute CACHE_TTL, making the cache stale
    // and ensuring the test's own fetch mock is used for the registry call.
    ;(globalThis as Record<string, unknown>).fetch = async () => ({
      ok:   true,
      json: async () => ({ plugins: [] }),
    })
    await fetchRegistry(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as Record<string, unknown>).fetch = origFetch
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('calls installPlugin for each available update and invokes onUpdated', async () => {
    const pluginId = 'plugin-alpha'

    // Create installed plugin at v1.0.0
    const pluginDir = path.join(tmpDir, pluginId)
    fs.mkdirSync(pluginDir)
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify({ id: pluginId, name: pluginId, version: '1.0.0' }))
    fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = {}')

    // Registry advertises v2.0.0
    const registry = { plugins: [{ id: pluginId, name: pluginId, version: '2.0.0', downloadUrl: 'http://fake/plugin-alpha.zip' }] }
    const zipBuf   = makePluginZip(pluginId, '2.0.0')

    // Advance Date.now() past the 5-minute cache TTL so fetchRegistry re-fetches
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    ;(globalThis as Record<string, unknown>).fetch = makeFetch(registry, [zipBuf])

    const onUpdated = vi.fn()
    await autoUpdatePlugins(tmpDir, '1.0.0', onUpdated)

    expect(onUpdated).toHaveBeenCalledOnce()
    expect(onUpdated).toHaveBeenCalledWith(pluginId, '2.0.0')
  })

  test('skips a failing update without stopping subsequent ones', async () => {
    const idA = 'plugin-beta'
    const idB = 'plugin-gamma'

    // Create two installed plugins at v1.0.0
    for (const id of [idA, idB]) {
      const d = path.join(tmpDir, id)
      fs.mkdirSync(d)
      fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ id, name: id, version: '1.0.0' }))
      fs.writeFileSync(path.join(d, 'index.js'), 'module.exports = {}')
    }

    // Registry advertises v2.0.0 for both
    const registry = {
      plugins: [
        { id: idA, name: idA, version: '2.0.0', downloadUrl: 'http://fake/beta.zip' },
        { id: idB, name: idB, version: '2.0.0', downloadUrl: 'http://fake/gamma.zip' },
      ]
    }

    // First download (idA) returns broken zip; second (idB) returns valid zip
    const brokenBuf = Buffer.from('not-a-zip')
    const goodBuf   = makePluginZip(idB, '2.0.0')

    // Advance Date.now() past the 5-minute cache TTL so fetchRegistry re-fetches
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    ;(globalThis as Record<string, unknown>).fetch = makeFetch(registry, [brokenBuf, goodBuf])

    const onUpdated = vi.fn()
    await autoUpdatePlugins(tmpDir, '1.0.0', onUpdated)

    // Only idB should have succeeded
    expect(onUpdated).toHaveBeenCalledOnce()
    expect(onUpdated).toHaveBeenCalledWith(idB, '2.0.0')
  })

  test('does nothing when checkUpdates returns empty (no newer version)', async () => {
    const pluginId = 'plugin-delta'

    const pluginDir = path.join(tmpDir, pluginId)
    fs.mkdirSync(pluginDir)
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify({ id: pluginId, name: pluginId, version: '1.0.0' }))
    fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = {}')

    // Registry has same version — no update
    const registry = { plugins: [{ id: pluginId, name: pluginId, version: '1.0.0', downloadUrl: 'http://fake/delta.zip' }] }

    // Advance Date.now() past the 5-minute cache TTL so fetchRegistry re-fetches
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    ;(globalThis as Record<string, unknown>).fetch = makeFetch(registry, [])

    const onUpdated = vi.fn()
    await autoUpdatePlugins(tmpDir, '1.0.0', onUpdated)

    expect(onUpdated).not.toHaveBeenCalled()
  })
})
