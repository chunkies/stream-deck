import fs           from 'fs'
import path         from 'path'
import { execFile } from 'child_process'

// adm-zip has no @types package
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as new (filePath?: string) => {
  getEntries(): Array<{ entryName: string }>
  extractAllTo(destDir: string, overwrite: boolean): void
}

const NPM          = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const REGISTRY_URL = 'https://raw.githubusercontent.com/chunkies/macropad/master/registry/registry.json'
const CACHE_TTL    = 5 * 60 * 1000

interface PluginManifest {
  id:      string
  name?:   string
  version?: string
  _dir?:   string
  _local?: boolean
  [key: string]: unknown
}

interface RegistryPlugin {
  id:          string
  name:        string
  version:     string
  downloadUrl: string
}

interface Registry {
  plugins?: RegistryPlugin[]
}

type ProgressFn = (status: { status: string; pct: number }) => void

let registryCache:     Registry | null = null
let registryCacheTime: number          = 0

// ── Semver ─────────────────────────────────────────────
function parseVer(v: string | undefined): [number, number, number] {
  const parts = ((v ?? '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n) || 0))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

export function semverGt(a: string | undefined, b: string | undefined): boolean {
  const [ma, mia, pa] = parseVer(a)
  const [mb, mib, pb] = parseVer(b)
  if (ma !== mb) return ma > mb
  if (mia !== mib) return mia > mib
  return pa > pb
}

// ── Registry ───────────────────────────────────────────
export async function fetchRegistry(force = false): Promise<Registry> {
  if (!force && registryCache && Date.now() - registryCacheTime < CACHE_TTL) {
    return registryCache
  }
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    registryCache     = await res.json() as Registry
    registryCacheTime = Date.now()
    return registryCache
  } catch (err) {
    if (registryCache) return registryCache   // serve stale on network error
    throw err
  }
}

// ── Installed manifests ────────────────────────────────
export function getInstalledManifests(pluginsDir: string): PluginManifest[] {
  const installed: PluginManifest[] = []
  if (!fs.existsSync(pluginsDir)) return installed
  for (const name of fs.readdirSync(pluginsDir)) {
    const dir          = path.join(pluginsDir, name)
    const manifestPath = path.join(dir, 'manifest.json')
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      if (!fs.existsSync(manifestPath)) continue
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
      installed.push({ ...manifest, _dir: name })
    } catch {}
  }
  return installed
}

// ── Download ───────────────────────────────────────────
async function downloadFile(url: string, destPath: string, onProgress: (pct: number) => void): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total  = parseInt(res.headers.get('content-length') ?? '0')
  let received = 0
  const chunks: Uint8Array[] = []

  const reader = res.body!.getReader()
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
function extractZip(zipPath: string, destDir: string): void {
  const zip        = new AdmZip(zipPath)
  const normalDest = path.resolve(destDir) + path.sep

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
export async function installPlugin(pluginId: string, downloadUrl: string, pluginsDir: string, onProgress?: ProgressFn): Promise<PluginManifest> {
  const tmpZip  = path.join(pluginsDir, `_tmp_${pluginId}.zip`)
  const destDir = path.join(pluginsDir, pluginId)

  try {
    if (onProgress) onProgress({ status: 'downloading', pct: 0 })
    await downloadFile(downloadUrl, tmpZip, pct => onProgress?.({ status: 'downloading', pct }))

    if (onProgress) onProgress({ status: 'extracting', pct: 100 })
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
    extractZip(tmpZip, destDir)

    const manifestPath = path.join(destDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) throw new Error('Invalid plugin: missing manifest.json')

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest

    // Validate plugin id matches folder name
    if (manifest.id && manifest.id !== pluginId) {
      throw new Error(`Plugin id mismatch: expected "${pluginId}", got "${manifest.id}"`)
    }

    // Install npm dependencies if plugin has a package.json
    const packageJsonPath = path.join(destDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      if (onProgress) onProgress({ status: 'installing', pct: 100 })
      await new Promise<void>((resolve, reject) => {
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
export function loadLocalPlugin(srcDir: string, pluginsDir: string): PluginManifest {
  const manifestPath = path.join(srcDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('No manifest.json found in selected folder')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest
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
export function uninstallPlugin(pluginId: string, pluginsDir: string): void {
  const dir = path.join(pluginsDir, pluginId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
}

// ── Check for updates (proper semver) ─────────────────
export async function checkUpdates(pluginsDir: string): Promise<Array<{ id: string; name?: string; installedVersion?: string; newVersion: string; downloadUrl: string }>> {
  const installed = getInstalledManifests(pluginsDir)
  if (!installed.length) return []

  let registry: Registry
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
    .filter((x): x is NonNullable<typeof x> => x !== null)
}
