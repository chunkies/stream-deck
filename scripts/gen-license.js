#!/usr/bin/env node
'use strict'

/**
 * Generate a Stream Deck Pro license key.
 * Usage: node scripts/gen-license.js [count]
 * Keys are in the format: SD-XXXXXXXX-XXXXXXXX-CHECKSUM
 */

const crypto = require('crypto')
const SECRET = 'REDACTED'

function randomPart() {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

function generateKey() {
  const a = randomPart()
  const b = randomPart()
  const check = crypto.createHmac('sha256', SECRET)
    .update(a + b)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()
  return `SD-${a}-${b}-${check}`
}

function validateKey(key) {
  const match = key.toUpperCase().match(/^SD-([A-Z0-9]{8})-([A-Z0-9]{8})-([A-Z0-9]{8})$/)
  if (!match) return false
  const [, a, b, check] = match
  const expected = crypto.createHmac('sha256', SECRET)
    .update(a + b)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()
  return check === expected
}

const count = parseInt(process.argv[2]) || 1
const keys = Array.from({ length: count }, generateKey)
keys.forEach(k => console.log(k))

// Self-verify
const allValid = keys.every(validateKey)
if (!allValid) { console.error('BUG: generated key failed validation'); process.exit(1) }
