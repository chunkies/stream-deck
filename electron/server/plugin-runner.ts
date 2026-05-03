// This script runs inside a worker_threads Worker — one per plugin.
// It loads the plugin, registers its handlers, and dispatches action calls
// received from the main thread via parentPort message passing.

import { workerData, parentPort } from 'worker_threads'
import Module from 'module'
import { createSDK, InternalPluginSDK as PluginSDK } from './plugin-sdk'

interface WorkerData { pluginId: string; pluginPath: string; dataDir: string }
interface InvokeMsg  { type: 'invoke'; id: string; key: string; params: unknown }

const { pluginId, pluginPath, dataDir } = workerData as WorkerData

// Block dangerous built-in modules — plugins may not require these directly
const BLOCKED = new Set(['child_process', 'cluster', 'dgram', 'net', 'tls'])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _resolveFilename = (Module as any)._resolveFilename.bind(Module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._resolveFilename = (request: string, ...rest: unknown[]) => {
  if (BLOCKED.has(request)) {
    const blockedMsg = `Plugin blocked: require("${request}") is not allowed — use the sdk instead`
    parentPort!.postMessage({ type: 'pluginLog', level: 'error', args: [blockedMsg], ts: Date.now() })
    throw new Error(blockedMsg)
  }
  return _resolveFilename(request, ...rest)
}

const sdk = createSDK(pluginId, dataDir, (payload) => {
  parentPort!.postMessage({ type: 'broadcast', payload })
})

// Forward all sdk.log calls to the main thread for centralised log collection
;(['info', 'warn', 'error'] as const).forEach(level => {
  const orig = sdk.log[level].bind(sdk.log)
  sdk.log[level] = (...args: unknown[]) => {
    orig(...args)
    parentPort!.postMessage({ type: 'pluginLog', level, args, ts: Date.now() })
  }
})

// Intercept direct http/https usage to enforce SSRF protection
// (plugins must use sdk.http which already blocks RFC1918 addresses)
const PRIVATE_RANGES = [
  /^127\./,  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/i, /^fc[0-9a-f]{2}:/i, /^localhost$/i,
]
function isPrivate(host: string): boolean {
  return PRIVATE_RANGES.some(re => re.test(host))
}
function extractHost(target: unknown): string {
  if (typeof target === 'string') {
    try { return new URL(target).hostname } catch { return target.split('/')[0] ?? '' }
  }
  if (target && typeof target === 'object') {
    return (target as Record<string, unknown>).hostname as string
      ?? (target as Record<string, unknown>).host as string ?? ''
  }
  return ''
}
;(['http', 'https'] as const).forEach(mod => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require(mod) as Record<string, unknown>
  for (const method of ['request', 'get'] as const) {
    const orig = m[method] as (...args: unknown[]) => unknown
    m[method] = (target: unknown, ...rest: unknown[]) => {
      if (isPrivate(extractHost(target))) {
        throw new Error(`Plugin blocked: direct ${mod}.${method} to private address — use sdk.http instead`)
      }
      return orig(target, ...rest)
    }
  }
})

// Prevent plugins from terminating the worker process intentionally
const _exit = process.exit.bind(process)
process.exit = ((code?: number) => {
  console.warn(`[plugin:${pluginId}] process.exit(${code}) blocked`)
  _exit(code)
}) as typeof process.exit
process.abort = (() => {
  console.warn(`[plugin:${pluginId}] process.abort() blocked`)
}) as typeof process.abort

process.on('uncaughtException', (err) => {
  parentPort!.postMessage({ type: 'error', error: err.message })
})

process.on('unhandledRejection', (reason) => {
  parentPort!.postMessage({ type: 'error', error: String(reason) })
})

process.on('exit', () => {
  if (sdk._reloadFn) sdk._reloadFn()
})

let handlers: Record<string, (params: unknown) => unknown> = {}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(pluginPath) as unknown
  // Support both `export default fn` (compiled to { default: fn }) and `module.exports = fn`
  const factory = (raw && typeof raw === 'object' && 'default' in raw && typeof (raw as Record<string, unknown>).default === 'function')
    ? (raw as Record<string, unknown>).default as (sdk: PluginSDK) => unknown
    : raw
  const result = typeof factory === 'function' ? (factory as (sdk: PluginSDK) => unknown)(sdk) : factory
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
    const errObj = err as Error
    parentPort!.postMessage({ type: 'pluginLog', level: 'error', args: [`Action "${key}" threw: ${errObj.message}`], ts: Date.now(), stack: errObj.stack })
    parentPort!.postMessage({ type: 'result', id, error: errObj.message })
  }
})
