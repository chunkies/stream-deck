import crypto from 'crypto'
import fs     from 'fs'
import path   from 'path'

// License format: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
// Each segment is 8 hex characters (32 hex chars total = 128-bit HMAC prefix)
// Validation: HMAC-SHA256 of 'macropad-pro' using LICENSE_SECRET, truncated to 32 hex chars

const LICENSE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/i
const LICENSE_PAYLOAD = 'macropad-pro'

/** Check only the format (regex), no crypto */
export function isValidLicenseKey(key: string): boolean {
  return LICENSE_REGEX.test(key)
}

/**
 * Compute the expected license key for a given secret.
 * Returns the HMAC-SHA256 of LICENSE_PAYLOAD truncated to 32 hex chars,
 * split into 4 groups of 8 with dashes.
 */
function computeExpected(secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(LICENSE_PAYLOAD).digest('hex')
  const h = hmac.slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 16)}-${h.slice(16, 24)}-${h.slice(24, 32)}`
}

/**
 * Pure HMAC validation. Returns false (not throws) if secret is empty.
 */
export function validateLicense(key: string, secret: string): boolean {
  if (!secret || !isValidLicenseKey(key)) return false
  const expected = computeExpected(secret)
  // Use timingSafeEqual to avoid timing attacks
  const a = Buffer.from(key.toLowerCase())
  const b = Buffer.from(expected.toLowerCase())
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Load a persisted license key from disk. Returns null if file missing or invalid. */
export function loadLicense(licenseFile: string): string | null {
  try {
    if (!fs.existsSync(licenseFile)) return null
    const raw = fs.readFileSync(licenseFile, 'utf8').trim()
    return isValidLicenseKey(raw) ? raw : null
  } catch {
    return null
  }
}

/** Persist a license key to disk, creating parent directories as needed. */
export function saveLicense(licenseFile: string, key: string): void {
  fs.mkdirSync(path.dirname(licenseFile), { recursive: true })
  fs.writeFileSync(licenseFile, key, 'utf8')
}
