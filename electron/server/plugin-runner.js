'use strict'

// This script runs inside a worker_threads Worker — one per plugin.
// It loads the plugin, registers its handlers, and dispatches action calls
// received from the main thread via parentPort message passing.

const { workerData, parentPort } = require('worker_threads')
const { createSDK } = require('./plugin-sdk')

const { pluginId, pluginPath, dataDir } = workerData

const sdk = createSDK(pluginId, dataDir, (payload) => {
  parentPort.postMessage({ type: 'broadcast', payload })
})

let handlers = {}

try {
  const raw = require(pluginPath)
  const result = typeof raw === 'function' ? raw(sdk) : raw
  handlers = {
    ...sdk._handlers,
    ...(result && typeof result === 'object' && !Array.isArray(result) && typeof result !== 'function' ? result : {})
  }
} catch (err) {
  parentPort.postMessage({ type: 'error', error: err.message })
  process.exit(1)
}

// Tell the main thread which action keys this plugin provides
parentPort.postMessage({ type: 'ready', actions: Object.keys(handlers) })

// Dispatch action calls from the main thread
parentPort.on('message', async (msg) => {
  if (msg.type !== 'invoke') return
  const { id, key, params } = msg
  try {
    const fn = handlers[key]
    if (!fn) throw new Error(`No handler: ${key}`)
    await Promise.resolve(fn(params))
    parentPort.postMessage({ type: 'result', id })
  } catch (err) {
    parentPort.postMessage({ type: 'result', id, error: err.message })
  }
})
