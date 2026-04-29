// This script runs inside a worker_threads Worker — one per plugin.
// It loads the plugin, registers its handlers, and dispatches action calls
// received from the main thread via parentPort message passing.

import { workerData, parentPort } from 'worker_threads'
import { createSDK, PluginSDK } from './plugin-sdk'

interface WorkerData { pluginId: string; pluginPath: string; dataDir: string }
interface InvokeMsg  { type: 'invoke'; id: string; key: string; params: unknown }

const { pluginId, pluginPath, dataDir } = workerData as WorkerData

const sdk = createSDK(pluginId, dataDir, (payload) => {
  parentPort!.postMessage({ type: 'broadcast', payload })
})

let handlers: Record<string, (params: unknown) => unknown> = {}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(pluginPath) as unknown
  const result = typeof raw === 'function' ? (raw as (sdk: PluginSDK) => unknown)(sdk) : raw
  handlers = {
    ...sdk._handlers,
    ...(result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, (p: unknown) => unknown> : {})
  }
} catch (err) {
  parentPort!.postMessage({ type: 'error', error: (err as Error).message })
  process.exit(1)
}

// Tell the main thread which action keys this plugin provides
parentPort!.postMessage({ type: 'ready', actions: Object.keys(handlers) })

// Dispatch action calls from the main thread
parentPort!.on('message', async (msg: InvokeMsg) => {
  if (msg.type !== 'invoke') return
  const { id, key, params } = msg
  try {
    const fn = handlers[key]
    if (!fn) throw new Error(`No handler: ${key}`)
    await Promise.resolve(fn(params))
    parentPort!.postMessage({ type: 'result', id })
  } catch (err) {
    parentPort!.postMessage({ type: 'result', id, error: (err as Error).message })
  }
})
