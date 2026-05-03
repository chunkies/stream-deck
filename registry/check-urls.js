#!/usr/bin/env node
// registry/check-urls.js
// For every plugin in registry.json:
//   1. Verify the downloadUrl returns HTTP 200
//   2. Download the zip, extract it, and verify manifest.json exists with a matching id
//
// Run: node registry/check-urls.js
// Exit 0 on success, exit 1 with a clear error on failure.
// No external dependencies — only Node built-ins + https/http.

'use strict'

const fs      = require('fs')
const path    = require('path')
const https   = require('https')
const http    = require('http')
const os      = require('os')
const zlib    = require('zlib')

const REGISTRY_PATH = path.join(__dirname, 'registry.json')

// ── Helpers ────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\ncheck-urls FAILED\n  ${msg}\n`)
  process.exit(1)
}

/** Follow redirects and return { statusCode, body: Buffer } */
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error(`Too many redirects fetching ${url}`))
    }
    const parsed  = new URL(url)
    const mod     = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { 'User-Agent': 'macropad-registry-check/1.0' }
    }
    const req = mod.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href
        res.resume()
        return resolve(fetchUrl(next, maxRedirects - 1))
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end',  ()      => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(new Error(`Timeout fetching ${url}`)) })
    req.end()
  })
}

/** Minimal ZIP parser — returns a map of { entryName → Buffer } for all files. */
function parseZip(buf) {
  const entries = {}

  // Find End of Central Directory record
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (no EOCD record)')

  const cdOffset = buf.readUInt32LE(eocdOffset + 16)
  const cdSize   = buf.readUInt32LE(eocdOffset + 12)
  let cdPos      = cdOffset

  while (cdPos < cdOffset + cdSize) {
    if (buf.readUInt32LE(cdPos) !== 0x02014b50) break  // Central directory file header signature

    const compression    = buf.readUInt16LE(cdPos + 10)
    const compressedSize = buf.readUInt32LE(cdPos + 20)
    const fnLen          = buf.readUInt16LE(cdPos + 28)
    const extraLen       = buf.readUInt16LE(cdPos + 30)
    const commentLen     = buf.readUInt16LE(cdPos + 32)
    const localOffset    = buf.readUInt32LE(cdPos + 42)
    const fileName       = buf.slice(cdPos + 46, cdPos + 46 + fnLen).toString('utf8')

    cdPos += 46 + fnLen + extraLen + commentLen

    if (fileName.endsWith('/')) continue  // directory entry

    // Read local file header to get actual data offset
    const lfhExtraLen  = buf.readUInt16LE(localOffset + 28)
    const lfhFnLen     = buf.readUInt16LE(localOffset + 26)
    const dataOffset   = localOffset + 30 + lfhFnLen + lfhExtraLen
    const compressedData = buf.slice(dataOffset, dataOffset + compressedSize)

    if (compression === 0) {
      entries[fileName] = compressedData
    } else if (compression === 8) {
      try {
        entries[fileName] = zlib.inflateRawSync(compressedData)
      } catch {
        entries[fileName] = compressedData  // store raw on inflate error; we only need to check existence
      }
    }
  }

  return entries
}

/** Strip a single top-level directory prefix (GitHub archive style: repo-1.0.0/file → file) */
function stripTopDir(entries) {
  const keys = Object.keys(entries)
  if (keys.length === 0) return entries

  const prefix = keys[0].split('/')[0] + '/'
  const allHavePrefix = keys.every(k => k.startsWith(prefix))
  if (!allHavePrefix) return entries

  const stripped = {}
  for (const [k, v] of Object.entries(entries)) {
    stripped[k.slice(prefix.length)] = v
  }
  return stripped
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load registry
  let registry
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
  } catch (err) {
    fail(`Cannot load registry.json: ${err.message}`)
  }

  const plugins = registry.plugins || []
  if (plugins.length === 0) {
    console.log('check-urls: no plugins to check')
    return
  }

  let allPassed = true

  for (const plugin of plugins) {
    const { id, downloadUrl } = plugin
    if (!downloadUrl) {
      console.error(`  SKIP  ${id} — no downloadUrl`)
      continue
    }

    process.stdout.write(`  checking ${id} ... `)

    // ── Step 1: HTTP 200 check ─────────────────────────────────────────────
    let response
    try {
      response = await fetchUrl(downloadUrl)
    } catch (err) {
      console.error(`FAIL\n    Network error: ${err.message}`)
      allPassed = false
      continue
    }

    if (response.statusCode !== 200) {
      console.error(`FAIL\n    downloadUrl returned HTTP ${response.statusCode} (expected 200)\n    URL: ${downloadUrl}`)
      allPassed = false
      continue
    }

    // ── Step 2: Verify manifest.json in zip ────────────────────────────────
    let entries
    try {
      entries = parseZip(response.body)
    } catch (err) {
      console.error(`FAIL\n    Could not parse ZIP: ${err.message}`)
      allPassed = false
      continue
    }

    entries = stripTopDir(entries)

    const manifestBuf = entries['manifest.json']
    if (!manifestBuf) {
      console.error(`FAIL\n    manifest.json not found in zip`)
      allPassed = false
      continue
    }

    let manifest
    try {
      manifest = JSON.parse(manifestBuf.toString('utf8'))
    } catch (err) {
      console.error(`FAIL\n    manifest.json is not valid JSON: ${err.message}`)
      allPassed = false
      continue
    }

    if (manifest.id !== id) {
      console.error(`FAIL\n    manifest.json id mismatch: expected "${id}", got "${manifest.id}"`)
      allPassed = false
      continue
    }

    console.log(`OK (HTTP 200, manifest.json id="${manifest.id}")`)
  }

  if (!allPassed) {
    fail('One or more plugins failed URL/manifest checks (see above)')
  }

  console.log(`\ncheck-urls OK — ${plugins.length} plugin(s) verified`)
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`)
  process.exit(1)
})
