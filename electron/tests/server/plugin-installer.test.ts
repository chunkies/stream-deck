import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import AdmZip from 'adm-zip'
import fs   from 'fs'
import path from 'path'
import os   from 'os'

const { semverGt, getInstalledManifests, installPlugin } = require('../../../dist/electron/server/plugin-installer')

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
