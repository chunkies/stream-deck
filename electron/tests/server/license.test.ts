import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs   from 'fs'
import os   from 'os'
import path from 'path'
import crypto from 'crypto'

const { isValidLicenseKey, validateLicense, loadLicense, saveLicense } =
  require('../../../dist/electron/server/license') as {
    isValidLicenseKey: (key: string) => boolean
    validateLicense:   (key: string, secret: string) => boolean
    loadLicense:       (licenseFile: string) => string | null
    saveLicense:       (licenseFile: string, key: string) => void
  }

// ── Helper: build a valid HMAC license key for a given secret ──────────────
function buildLicenseKey(secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update('macropad-pro').digest('hex')
  const h = hmac.slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 16)}-${h.slice(16, 24)}-${h.slice(24, 32)}`
}

// ── isValidLicenseKey ──────────────────────────────────────────────────────
describe('isValidLicenseKey', () => {
  test('accepts well-formed lowercase hex key', () => {
    expect(isValidLicenseKey('abcd1234-ef567890-12345678-abcdef12')).toBe(true)
  })

  test('accepts uppercase hex key', () => {
    expect(isValidLicenseKey('ABCD1234-EF567890-12345678-ABCDEF12')).toBe(true)
  })

  test('rejects key with wrong segment length', () => {
    expect(isValidLicenseKey('abcd123-ef567890-12345678-abcdef12')).toBe(false)
  })

  test('rejects key with too many segments', () => {
    expect(isValidLicenseKey('abcd1234-ef567890-12345678-abcdef12-00000000')).toBe(false)
  })

  test('rejects key with non-hex characters', () => {
    expect(isValidLicenseKey('zzzz1234-ef567890-12345678-abcdef12')).toBe(false)
  })

  test('rejects empty string', () => {
    expect(isValidLicenseKey('')).toBe(false)
  })

  test('rejects key missing dashes', () => {
    expect(isValidLicenseKey('abcd1234ef56789012345678abcdef12')).toBe(false)
  })
})

// ── validateLicense ────────────────────────────────────────────────────────
describe('validateLicense', () => {
  const secret = 'test-secret-abc-xyz-123'

  test('returns true for the correct HMAC key', () => {
    const key = buildLicenseKey(secret)
    expect(validateLicense(key, secret)).toBe(true)
  })

  test('returns false for a wrong key with same format', () => {
    expect(validateLicense('00000000-00000000-00000000-00000000', secret)).toBe(false)
  })

  test('returns false when secret is empty string', () => {
    const key = buildLicenseKey(secret)
    expect(validateLicense(key, '')).toBe(false)
  })

  test('returns false for invalid key format', () => {
    expect(validateLicense('not-a-valid-key', secret)).toBe(false)
  })

  test('is case-insensitive for key comparison', () => {
    const key = buildLicenseKey(secret).toUpperCase()
    expect(validateLicense(key, secret)).toBe(true)
  })

  test('returns false when key is empty string', () => {
    expect(validateLicense('', secret)).toBe(false)
  })

  test('different secrets produce different keys that fail cross-validation', () => {
    const key1 = buildLicenseKey('secret-one')
    const key2 = buildLicenseKey('secret-two')
    expect(key1).not.toBe(key2)
    expect(validateLicense(key1, 'secret-two')).toBe(false)
    expect(validateLicense(key2, 'secret-one')).toBe(false)
  })
})

// ── loadLicense / saveLicense ──────────────────────────────────────────────
describe('loadLicense / saveLicense file round-trip', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macropad-license-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('saveLicense writes the key and loadLicense reads it back', () => {
    const file = path.join(tmpDir, 'license.key')
    const key  = 'abcd1234-ef567890-12345678-abcdef12'
    saveLicense(file, key)
    expect(loadLicense(file)).toBe(key)
  })

  test('loadLicense returns null when file does not exist', () => {
    const file = path.join(tmpDir, 'nonexistent.key')
    expect(loadLicense(file)).toBeNull()
  })

  test('loadLicense returns null for a file with invalid key content', () => {
    const file = path.join(tmpDir, 'bad.key')
    fs.writeFileSync(file, 'not-a-valid-license-key', 'utf8')
    expect(loadLicense(file)).toBeNull()
  })

  test('saveLicense creates parent directories if they do not exist', () => {
    const file = path.join(tmpDir, 'nested', 'dir', 'license.key')
    const key  = 'abcd1234-ef567890-12345678-abcdef12'
    saveLicense(file, key)
    expect(fs.existsSync(file)).toBe(true)
    expect(loadLicense(file)).toBe(key)
  })

  test('loadLicense trims whitespace from stored key', () => {
    const file = path.join(tmpDir, 'license.key')
    const key  = 'abcd1234-ef567890-12345678-abcdef12'
    fs.writeFileSync(file, `  ${key}\n`, 'utf8')
    expect(loadLicense(file)).toBe(key)
  })
})
