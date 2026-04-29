'use strict'

const fs             = require('fs')
const path           = require('path')
const { execFile }   = require('child_process')
const NPM            = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REGISTRY_URL = 'https://raw.githubusercontent.com/chunkies/macropad/master/registry/registry.json'
const CACHE_TTL    = 5 * 60 * 1000

let registryCache     = null
let registryCacheTime = 0

// ── Semver ─────────────────────────────────────────────
function parseVer(v) {
  return ((v || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n) || 0))
}

function semverGt(a, b) {
  const [ma, mia, pa] = parseVer(a)
  const [mb, mib, pb] = parseVer(b)
  if (ma !== mb) return ma > mb
  if (mia !== mib) return mia > mib
  return pa > pb
}

// ── Registry ───────────────────────────────────────────
async function fetchRegistry(force = false) {
  if (!force && registryCache && Date.now() - registryCacheTime < CACHE_TTL) {
    return registryCache
  }
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    registryCache     = await res.json()
    registryCacheTime = Date.now()
    return registryCache
  } catch (err) {
    if (registryCache) return registryCache   // serve stale on network error
    throw err
  }
}

// ── Installed manifests ────────────────────────────────
function getInstalledManifests(pluginsDir) {
  const installed = []
  if (!fs.existsSync(pluginsDir)) return installed
  for (const name of fs.readdirSync(pluginsDir)) {
    const dir          = path.join(pluginsDir, name)
    const manifestPath = path.join(dir, 'manifest.json')
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      if (!fs.existsSync(manifestPath)) continue
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      installed.push({ ...manifest, _dir: name })
    } catch {}
  }
  return installed
}

// ── Download ───────────────────────────────────────────
async function downloadFile(url, destPath, onProgress) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total  = parseInt(res.headers.get('content-length') || '0')
  let received = 0
  const chunks = []

  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (onProgress && total) onProgress(Math.round((received / total) * 100))
  }

  fs.writeFileSync(destPath, Buffer.concat(chunks.map(c => Buffer.from(c))))
}

// ── Safe extraction via adm-zip ────────────────────────
function extractZip(zipPath, destDir) {
  const AdmZip       = require('adm-zip')
  const zip          = new AdmZip(zipPath)
  const normalDest   = path.resolve(destDir) + path.sep

  // Validate all entries before extracting — prevents path traversal
  for (const entry of zip.getEntries()) {
    const entryPath = path.resolve(path.join(destDir, entry.entryName))
    if (!entryPath.startsWith(normalDest)) {
      throw new Error(`Unsafe zip entry (path traversal): ${entry.entryName}`)
    }
  }

  fs.mkdirSync(destDir, { recursive: true })
  zip.extractAllTo(destDir, true)

  // Flatten single top-level directory (GitHub archive style: repo-1.0.0/)
  const entries = fs.readdirSync(destDir)
  if (entries.length === 1) {
    const sub = path.join(destDir, entries[0])
    if (fs.statSync(sub).isDirectory()) {
      for (const f of fs.readdirSync(sub)) {
        fs.renameSync(path.join(sub, f), path.join(destDir, f))
      }
      fs.rmdirSync(sub)
    }
  }
}

// ── Install from URL ───────────────────────────────────
async function installPlugin(pluginId, downloadUrl, pluginsDir, onProgress) {
  const tmpZip = path.join(pluginsDir, `_tmp_${pluginId}.zip`)
  const destDir = path.join(pluginsDir, pluginId)

  try {
    if (onProgress) onProgress({ status: 'downloading', pct: 0 })
    await downloadFile(downloadUrl, tmpZip, pct => onProgress?.({ status: 'downloading', pct }))

    if (onProgress) onProgress({ status: 'extracting', pct: 100 })
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
    extractZip(tmpZip, destDir)

    const manifestPath = path.join(destDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) throw new Error('Invalid plugin: missing manifest.json')

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // Validate plugin id matches folder name
    if (manifest.id && manifest.id !== pluginId) {
      throw new Error(`Plugin id mismatch: expected "${pluginId}", got "${manifest.id}"`)
    }

    // Install npm dependencies if plugin has a package.json
    const packageJsonPath = path.join(destDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      if (onProgress) onProgress({ status: 'installing', pct: 100 })
      await new Promise((resolve, reject) => {
        execFile(NPM, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: destDir, timeout: 120000 }, (err) => {
          if (err) reject(new Error(`npm install failed: ${err.message}`))
          else resolve()
        })
      })
    }

    if (onProgress) onProgress({ status: 'done', pct: 100 })
    return manifest
  } catch (err) {
    if (fs.existsSync(destDir)) try { fs.rmSync(destDir, { recursive: true }) } catch {}
    throw err
  } finally {
    try { fs.unlinkSync(tmpZip) } catch {}
  }
}

// ── Load from local folder (dev mode) ─────────────────
function loadLocalPlugin(srcDir, pluginsDir) {
  const manifestPath = path.join(srcDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('No manifest.json found in selected folder')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!manifest.id) throw new Error('manifest.json must have an "id" field')

  const destDir = path.join(pluginsDir, manifest.id)
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })

  // Recursive copy — handles subdirectories (lib/, assets/, etc.)
  fs.cpSync(srcDir, destDir, { recursive: true })

  // Mark as local dev plugin so update checks skip it
  manifest._local = true
  fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

// ── Uninstall ──────────────────────────────────────────
function uninstallPlugin(pluginId, pluginsDir) {
  const dir = path.join(pluginsDir, pluginId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
}

// ── Check for updates (proper semver) ─────────────────
async function checkUpdates(pluginsDir) {
  const installed = getInstalledManifests(pluginsDir)
  if (!installed.length) return []

  let registry
  try { registry = await fetchRegistry() } catch { return [] }

  return installed
    .filter(local => !local._local)
    .map(local => {
      const remote = registry.plugins?.find(p => p.id === local.id)
      if (remote && semverGt(remote.version, local.version)) {
        return { id: local.id, name: local.name, installedVersion: local.version, newVersion: remote.version, downloadUrl: remote.downloadUrl }
      }
      return null
    })
    .filter(Boolean)
}

module.exports = { fetchRegistry, getInstalledManifests, installPlugin, loadLocalPlugin, uninstallPlugin, checkUpdates, semverGt }
