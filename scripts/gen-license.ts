import crypto from 'crypto'

// Print the single valid MacroPad Pro license key for a given LICENSE_SECRET.
// Usage: npm run gen-license
//
// Key format: HMAC-SHA256(secret, 'macropad-pro') truncated to 32 hex chars,
// split into 4 groups of 8 with dashes — matches license.ts exactly.

const SECRET = process.env.LICENSE_SECRET
if (!SECRET) {
  console.error('Error: LICENSE_SECRET env var is required')
  process.exit(1)
}

const hmac = crypto.createHmac('sha256', SECRET).update('macropad-pro').digest('hex')
const h = hmac.slice(0, 32)
const key = `${h.slice(0, 8)}-${h.slice(8, 16)}-${h.slice(16, 24)}-${h.slice(24, 32)}`

console.log(key)
