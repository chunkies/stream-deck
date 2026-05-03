import { describe, test, expect } from 'vitest'
import { Worker } from 'worker_threads'
import fs   from 'fs'
import path from 'path'
import os   from 'os'

// ── Module blocklist ───────────────────────────────────
// We test the blocklist by spinning up an actual plugin-runner Worker
// with a tiny plugin that tries to require a blocked/safe module.

type WorkerMsg = { type: string; error?: string; actions?: string[]; level?: string; args?: unknown[] }

function runPlugin(pluginCode: string): Promise<WorkerMsg> {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-test-'))
    const pluginPath = path.join(tmpDir, 'plugin.js')
    const dataDir    = tmpDir
    fs.writeFileSync(pluginPath, pluginCode)

    const PLUGIN_RUNNER = path.join(__dirname, '../../../dist/electron/server/plugin-runner.js')
    const worker = new Worker(PLUGIN_RUNNER, {
      workerData: { pluginId: 'test', pluginPath, dataDir }
    })

    const timer = setTimeout(() => {
      worker.terminate().catch(() => {})
      reject(new Error('Worker startup timeout'))
    }, 5000)

    worker.on('message', (msg: WorkerMsg) => {
      if (msg.type === 'pluginLog') return
      clearTimeout(timer)
      worker.terminate().catch(() => {})
      fs.rmSync(tmpDir, { recursive: true, force: true })
      resolve(msg)
    })

    worker.on('error', (err) => {
      clearTimeout(timer)
      fs.rmSync(tmpDir, { recursive: true, force: true })
      reject(err)
    })
  })
}

function runPluginAllMessages(pluginCode: string): Promise<WorkerMsg[]> {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-test-'))
    const pluginPath = path.join(tmpDir, 'plugin.js')
    const dataDir    = tmpDir
    fs.writeFileSync(pluginPath, pluginCode)

    const PLUGIN_RUNNER = path.join(__dirname, '../../../dist/electron/server/plugin-runner.js')
    const worker = new Worker(PLUGIN_RUNNER, {
      workerData: { pluginId: 'test', pluginPath, dataDir }
    })

    const messages: WorkerMsg[] = []

    const timer = setTimeout(() => {
      worker.terminate().catch(() => {})
      fs.rmSync(tmpDir, { recursive: true, force: true })
      resolve(messages)
    }, 5000)

    worker.on('message', (msg: WorkerMsg) => {
      messages.push(msg)
      if (msg.type === 'error' || msg.type === 'ready') {
        clearTimeout(timer)
        worker.terminate().catch(() => {})
        fs.rmSync(tmpDir, { recursive: true, force: true })
        resolve(messages)
      }
    })

    worker.on('error', (err) => {
      clearTimeout(timer)
      fs.rmSync(tmpDir, { recursive: true, force: true })
      reject(err)
    })
  })
}

describe('plugin-runner module blocklist', () => {
  test('requiring child_process throws a descriptive error', async () => {
    const msg = await runPlugin(`
      try {
        require('child_process')
        module.exports = () => {}
      } catch (e) {
        // error message comes via parentPort from plugin-runner catch block
        throw e
      }
    `)
    expect(msg.type).toBe('error')
    expect(msg.error).toMatch(/child_process/)
    expect(msg.error).toMatch(/sdk/)
  })

  test('requiring net throws a descriptive error', async () => {
    const msg = await runPlugin(`require('net'); module.exports = () => {}`)
    expect(msg.type).toBe('error')
    expect(msg.error).toMatch(/net/)
  })

  test('requiring tls throws a descriptive error', async () => {
    const msg = await runPlugin(`require('tls'); module.exports = () => {}`)
    expect(msg.type).toBe('error')
    expect(msg.error).toMatch(/tls/)
  })

  test('requiring dgram throws a descriptive error', async () => {
    const msg = await runPlugin(`require('dgram'); module.exports = () => {}`)
    expect(msg.type).toBe('error')
    expect(msg.error).toMatch(/dgram/)
  })

  test('requiring cluster throws a descriptive error', async () => {
    const msg = await runPlugin(`require('cluster'); module.exports = () => {}`)
    expect(msg.type).toBe('error')
    expect(msg.error).toMatch(/cluster/)
  })

  test('safe module path loads without error', async () => {
    const msg = await runPlugin(`
      const path = require('path')
      module.exports = (sdk) => {
        sdk.on('test.noop', () => {})
      }
    `)
    expect(msg.type).toBe('ready')
  })

  test('safe module crypto loads without error', async () => {
    const msg = await runPlugin(`
      const crypto = require('crypto')
      module.exports = (sdk) => {}
    `)
    expect(msg.type).toBe('ready')
  })

  test('safe module os loads without error', async () => {
    const msg = await runPlugin(`
      const os = require('os')
      module.exports = (sdk) => {}
    `)
    expect(msg.type).toBe('ready')
  })

  test('requiring child_process sends a pluginLog error message before the error message', async () => {
    const messages = await runPluginAllMessages(`
      try {
        require('child_process')
        module.exports = () => {}
      } catch (e) {
        throw e
      }
    `)
    const logMsg = messages.find(m => m.type === 'pluginLog' && m.level === 'error')
    expect(logMsg).toBeDefined()
    const logIndex   = messages.indexOf(logMsg!)
    const errorIndex = messages.findIndex(m => m.type === 'error')
    expect(logIndex).toBeLessThan(errorIndex)
  })

  test('requiring child_process pluginLog message mentions child_process', async () => {
    const messages = await runPluginAllMessages(`
      try {
        require('child_process')
        module.exports = () => {}
      } catch (e) {
        throw e
      }
    `)
    const logMsg = messages.find(m => m.type === 'pluginLog' && m.level === 'error')
    expect(logMsg).toBeDefined()
    expect(String((logMsg!.args ?? [])[0])).toMatch(/child_process/)
  })
})
