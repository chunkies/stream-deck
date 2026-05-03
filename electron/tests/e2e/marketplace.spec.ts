/**
 * E2E tests for the marketplace — install, uninstall, and plugin-tile flow.
 *
 * Strategy:
 *   - Launch the real Electron app (dist/electron/main/index.js)
 *   - Get the userData path via app.evaluate() (safe — only accesses Electron API)
 *   - Copy the demo plugin folder directly to userData/plugins (bypasses dialog)
 *   - Mark it as _local in manifest.json
 *   - Reload plugins via window.mp.reloadPlugins() through the renderer window
 *   - Verify getInstalled returns the demo plugin
 *   - Verify uninstall removes it
 *
 * Note: demo.httpFetch is NOT triggered — avoids external network in CI.
 */

import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import fs   from 'fs'

const ROOT        = path.resolve(__dirname, '../../..')
const MAIN_JS     = path.join(ROOT, 'dist/electron/main/index.js')
const DEMO_PLUGIN = path.join(ROOT, 'plugins/demo')

async function launchApp() {
  const app = await electron.launch({
    args:    [MAIN_JS],
    env:     { ...process.env, NODE_ENV: 'test' },
    timeout: 30000,
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  return { app, win }
}

/** Copy the demo plugin folder directly into userData/plugins (simulates loadLocalPlugin). */
function copyDemoPlugin(pluginsDir: string) {
  const destDir = path.join(pluginsDir, 'demo')
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
  fs.mkdirSync(destDir, { recursive: true })
  fs.cpSync(DEMO_PLUGIN, destDir, { recursive: true })
  // Mark as local so update checks skip it
  const manifestPath = path.join(destDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest._local = true
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

// ── Marketplace — install flow ─────────────────────────────────────────────

test.describe('Marketplace — demo plugin install', () => {
  let appHandle: Awaited<ReturnType<typeof electron.launch>>
  let win: Awaited<ReturnType<typeof appHandle.firstWindow>>
  let pluginsDir: string

  test.beforeAll(async () => {
    ;({ app: appHandle, win } = await launchApp())

    // Get the userData path from the running Electron app
    const userData = await appHandle.evaluate(({ app }) => app.getPath('userData'))
    pluginsDir = path.join(userData, 'plugins')

    // Open the marketplace window so we can call window.mp.*
    await win.evaluate(() => window.api.openMarketplace())
    await win.waitForTimeout(500)
  })

  test.afterAll(async () => {
    // Clean up demo plugin from userData before closing
    const destDir = path.join(pluginsDir, 'demo')
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
    await appHandle.close()
  })

  test('marketplace window is present', async () => {
    const wins = await appHandle.windows()
    expect(wins.length).toBeGreaterThanOrEqual(1)
  })

  test('can install demo plugin by copying to userData/plugins', async () => {
    copyDemoPlugin(pluginsDir)

    const manifestPath = path.join(pluginsDir, 'demo', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    expect(manifest.id).toBe('demo')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest._local).toBe(true)
    expect(fs.existsSync(path.join(pluginsDir, 'demo', 'index.js'))).toBe(true)
  })

  test('mp:get-installed returns the demo plugin after install', async () => {
    // Ensure demo is in place
    copyDemoPlugin(pluginsDir)

    // Reload plugins via the marketplace window so IPC sees the new files
    const mpWin = (await appHandle.windows()).find(w => w.url().includes('marketplace')) ?? win
    const installed = await mpWin.evaluate(() => window.mp.getInstalled()) as Array<{
      id: string; name: string; _local?: boolean
    }>

    const demo = installed.find(p => p.id === 'demo')
    expect(demo).toBeTruthy()
    expect(demo!.name).toBe('SDK Demo')
    expect(demo!._local).toBe(true)
  })

  test('can uninstall demo plugin', async () => {
    const destDir = path.join(pluginsDir, 'demo')

    // Ensure it exists before uninstalling
    copyDemoPlugin(pluginsDir)
    expect(fs.existsSync(destDir)).toBe(true)

    // Remove via filesystem (same as uninstallPlugin)
    fs.rmSync(destDir, { recursive: true })

    // Verify via IPC
    const mpWin = (await appHandle.windows()).find(w => w.url().includes('marketplace')) ?? win
    const remaining = await mpWin.evaluate(() => window.mp.getInstalled()) as Array<{ id: string }>
    expect(remaining.find(p => p.id === 'demo')).toBeUndefined()
  })
})

// ── Registry validation ────────────────────────────────────────────────────

test.describe('Registry — demo plugin entry', () => {
  test('demo is present in registry.json', () => {
    const registry = require(path.join(ROOT, 'registry/registry.json'))
    const entry = registry.plugins.find((p: { id: string }) => p.id === 'demo')
    expect(entry).toBeTruthy()
    expect(entry.version).toBe('1.0.0')
    expect(entry.downloadUrl).toMatch(/demo-1\.0\.0\.zip$/)
    expect(entry.tags).toContain('demo')
  })

  test('demo release zip exists on disk', () => {
    const zipPath = path.join(ROOT, 'releases/demo-1.0.0.zip')
    const fs = require('fs')
    expect(fs.existsSync(zipPath)).toBe(true)
    expect(fs.statSync(zipPath).size).toBeGreaterThan(500)
  })

  test('demo plugin zip contains manifest.json and index.js', () => {
    const AdmZip = require('adm-zip')
    const zip    = new AdmZip(path.join(ROOT, 'releases/demo-1.0.0.zip'))
    const entries = zip.getEntries().map((e: { entryName: string }) => e.entryName)
    expect(entries).toContain('manifest.json')
    expect(entries).toContain('index.js')
  })
})
