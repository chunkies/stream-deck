#!/usr/bin/env node
// registry/validate.js — validates registry/registry.json schema
// Run: node registry/validate.js  (or via npm run validate:registry)
// Exit 0 on success, exit 1 with a clear error on failure.

'use strict'

const fs   = require('fs')
const path = require('path')

const REGISTRY_PATH = path.join(__dirname, 'registry.json')

// ── Helpers ────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\nvalidate:registry FAILED\n  ${msg}\n`)
  process.exit(1)
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function isHttpsUrl(v) {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

// ── Load ───────────────────────────────────────────────────────────────────

let raw
try {
  raw = fs.readFileSync(REGISTRY_PATH, 'utf8')
} catch (err) {
  fail(`Cannot read registry.json: ${err.message}`)
}

let registry
try {
  registry = JSON.parse(raw)
} catch (err) {
  fail(`registry.json is not valid JSON: ${err.message}`)
}

// ── Top-level structure ────────────────────────────────────────────────────

if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
  fail('registry.json root must be a JSON object')
}

if (typeof registry.schemaVersion !== 'number') {
  fail('registry.schemaVersion must be a number')
}

if (typeof registry.updated !== 'string') {
  fail('registry.updated must be a string (YYYY-MM-DD)')
}

if (!Array.isArray(registry.plugins)) {
  fail('registry.plugins must be an array')
}

// ── Per-plugin validation ─────────────────────────────────────────────────

const seenIds = new Set()

for (let i = 0; i < registry.plugins.length; i++) {
  const p   = registry.plugins[i]
  const ctx = `plugins[${i}]`

  // id
  if (!isNonEmptyString(p.id)) {
    fail(`${ctx}.id must be a non-empty string`)
  }
  if (!/^[a-z0-9-]+$/.test(p.id)) {
    fail(`${ctx}.id must match /^[a-z0-9-]+$/ (got "${p.id}")`)
  }
  if (seenIds.has(p.id)) {
    fail(`Duplicate plugin id: "${p.id}"`)
  }
  seenIds.add(p.id)

  // name
  if (!isNonEmptyString(p.name)) {
    fail(`${ctx} (id="${p.id}"): name must be a non-empty string`)
  }

  // version
  if (!isNonEmptyString(p.version)) {
    fail(`${ctx} (id="${p.id}"): version must be a non-empty string`)
  }
  if (!/^\d+\.\d+\.\d+/.test(p.version)) {
    fail(`${ctx} (id="${p.id}"): version must be semver (got "${p.version}")`)
  }

  // description
  if (!isNonEmptyString(p.description)) {
    fail(`${ctx} (id="${p.id}"): description must be a non-empty string`)
  }

  // author (required, non-empty string)
  if (!isNonEmptyString(p.author)) {
    fail(`${ctx} (id="${p.id}"): author must be a non-empty string`)
  }

  // license (required, non-empty string)
  if (!isNonEmptyString(p.license)) {
    fail(`${ctx} (id="${p.id}"): license must be a non-empty string`)
  }

  // icon (required, non-empty string)
  if (!isNonEmptyString(p.icon)) {
    fail(`${ctx} (id="${p.id}"): icon must be a non-empty string`)
  }

  // tags (required array with at least 1 element)
  if (!Array.isArray(p.tags) || p.tags.length === 0) {
    fail(`${ctx} (id="${p.id}"): tags must be an array with at least 1 element`)
  }
  for (const tag of p.tags) {
    if (!isNonEmptyString(tag)) {
      fail(`${ctx} (id="${p.id}"): every tag must be a non-empty string`)
    }
  }

  // price
  if (typeof p.price !== 'number' || p.price < 0) {
    fail(`${ctx} (id="${p.id}"): price must be a non-negative number`)
  }

  // downloadUrl (required https URL)
  if (!isHttpsUrl(p.downloadUrl)) {
    fail(`${ctx} (id="${p.id}"): downloadUrl must be a valid https URL (got "${p.downloadUrl}")`)
  }

  // repo — required for verified plugins (non-empty https URL if present; but if it exists it must be valid)
  if (p.repo !== undefined && !isHttpsUrl(p.repo)) {
    fail(`${ctx} (id="${p.id}"): repo must be a valid https URL (got "${p.repo}")`)
  }

  // homepage — valid https URL if present
  if (p.homepage !== undefined && p.homepage !== '' && !isHttpsUrl(p.homepage)) {
    fail(`${ctx} (id="${p.id}"): homepage must be a valid https URL (got "${p.homepage}")`)
  }

  // minAppVersion (optional but must be semver if present)
  if (p.minAppVersion !== undefined) {
    if (!isNonEmptyString(p.minAppVersion) || !/^\d+\.\d+\.\d+/.test(p.minAppVersion)) {
      fail(`${ctx} (id="${p.id}"): minAppVersion must be semver (got "${p.minAppVersion}")`)
    }
  }

  // widgets (optional)
  if (p.widgets !== undefined) {
    if (!Array.isArray(p.widgets)) {
      fail(`${ctx} (id="${p.id}"): widgets must be an array`)
    }
    for (let j = 0; j < p.widgets.length; j++) {
      const w    = p.widgets[j]
      const wctx = `${ctx} (id="${p.id}").widgets[${j}]`
      if (!isNonEmptyString(w.key))   fail(`${wctx}: key must be a non-empty string`)
      if (!isNonEmptyString(w.label)) fail(`${wctx}: label must be a non-empty string`)
    }
  }
}

// ── All checks passed ──────────────────────────────────────────────────────

console.log(`validate:registry OK — ${registry.plugins.length} plugin(s) validated`)
