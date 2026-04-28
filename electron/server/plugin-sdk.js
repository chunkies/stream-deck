'use strict'

const { execSync, exec } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const SHELL = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh'

function createSDK(pluginId, pluginsDataDir, broadcastFn) {
  const storageFile = path.join(pluginsDataDir, `${pluginId}.json`)
  const _handlers   = {}

  function loadStorage() {
    try { return JSON.parse(fs.readFileSync(storageFile, 'utf8')) } catch { return {} }
  }
  function saveStorage(data) {
    fs.mkdirSync(pluginsDataDir, { recursive: true })
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2))
  }

  return {
    // Run shell commands
    shell: {
      exec: (cmd, opts = {}) =>
        execSync(cmd, { shell: SHELL, timeout: opts.timeout || 5000 }).toString().trim(),
      execAsync: (cmd, opts = {}) =>
        new Promise((resolve, reject) =>
          exec(cmd, { shell: SHELL, timeout: opts.timeout || 5000 }, (err, stdout) =>
            err ? reject(err) : resolve(stdout.trim())
          )
        )
    },

    // Namespaced key-value storage (persisted to JSON per plugin)
    storage: {
      get:    (key)        => { const d = loadStorage(); return key !== undefined ? d[key] : d },
      set:    (key, value) => { const d = loadStorage(); d[key] = value; saveStorage(d) },
      delete: (key)        => { const d = loadStorage(); delete d[key]; saveStorage(d) },
      clear:  ()           => saveStorage({})
    },

    // HTTP helpers
    http: {
      get:  (url, opts = {}) =>
        fetch(url, { signal: AbortSignal.timeout(opts.timeout || 8000), headers: opts.headers })
          .then(r => opts.raw ? r : r.json()),
      post: (url, body, opts = {}) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeout || 8000)
        }).then(r => opts.raw ? r : r.json()),
      request: (url, init) => fetch(url, init)
    },

    // Broadcast a message to all connected PWA clients
    broadcast: (event, data) => {
      const payload = (typeof event === 'string' && data)
        ? { type: 'pluginEvent', pluginId, event, ...data }
        : { type: 'pluginEvent', pluginId, ...event }
      broadcastFn(payload)
    },

    // Register an action handler (key → async fn)
    on: (key, fn) => { _handlers[key] = fn },

    // Emit an action (called by the server when a button/slider fires)
    emit: async (key, params) => {
      if (_handlers[key]) await _handlers[key](params)
    },

    // Internal: used by the plugin loader to extract registered handlers
    _handlers,

    // WebSocket constructor (ws package) — lets plugins open outbound WS connections
    // without bundling ws themselves
    ws: require('ws'),

    // Logging (prefixed so dev knows which plugin logged)
    log: {
      info:  (...args) => console.log(`[plugin:${pluginId}]`,  ...args),
      warn:  (...args) => console.warn(`[plugin:${pluginId}]`, ...args),
      error: (...args) => console.error(`[plugin:${pluginId}]`, ...args)
    }
  }
}

module.exports = { createSDK }
