# @macropad/plugin-sdk

Developer documentation for building MacroPad plugins.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Plugin structure](#plugin-structure)
3. [JavaScript example](#javascript-example)
4. [TypeScript example](#typescript-example)
5. [SDK reference](#sdk-reference)
6. [Testing](#testing)
7. [Manifest reference](#manifest-reference)
8. [Security constraints](#security-constraints)
9. [Publishing](#publishing)

---

## Quick start

Scaffold a new plugin with the official CLI:

```sh
# JavaScript
npx create-macropad-plugin my-plugin

# TypeScript
npx create-macropad-plugin my-plugin --ts
```

Then:

```sh
cd my-plugin
npm install
npm test          # run the generated vitest suite
```

To test the plugin in MacroPad itself:

1. Open MacroPad → Marketplace → **Install local plugin**
2. Select the `my-plugin/` folder
3. The plugin loads immediately — no restart needed

---

## Plugin structure

A plugin is a directory that MacroPad installs. Two files are required:

```
my-plugin/
  manifest.json    # plugin metadata and action declarations
  index.js         # entry point (or index.ts compiled to dist/index.js)
  package.json     # optional — if present, MacroPad runs npm install --omit=dev
```

The `main` field in `package.json` tells MacroPad which file to `require()`. It defaults to `index.js` if `package.json` is absent. For TypeScript plugins, set `"main": "dist/index.js"` and compile before installing.

---

## JavaScript example

A full working plugin that uses notifications, shell commands, HTTP, storage, and a cron timer:

```js
'use strict'

/**
 * system-ping — polls a host every 30s and notifies on failure.
 */
module.exports = (sdk) => {
  // Load persisted settings (or use defaults on first run)
  let target = String(sdk.storage.get('target') ?? 'github.com')
  let failures = 0

  // Cron: check every 30 seconds
  const stopPoll = sdk.cron(30000, async () => {
    try {
      await sdk.shell.execAsync(`ping -c 1 -W 3 ${target}`, { timeout: 5000 })
      if (failures > 0) {
        sdk.notify('system-ping', `${target} is back online`)
        failures = 0
      }
      sdk.broadcast('status', { target, ok: true, failures })
    } catch {
      failures++
      sdk.notify('system-ping', `${target} unreachable (failure #${failures})`)
      sdk.broadcast('status', { target, ok: false, failures })
      sdk.log.warn(`Ping failed: ${target} (${failures} failures)`)
    }
  })

  // Action: change the target host
  sdk.onAction('system-ping.setTarget', (params) => {
    target = String(params.host ?? 'github.com')
    sdk.storage.set('target', target)
    sdk.notify('system-ping', `Now monitoring ${target}`)
    sdk.log.info(`Target changed to ${target}`)
  })

  // Action: request an immediate status broadcast
  sdk.onAction('system-ping.getStatus', () => {
    sdk.broadcast('status', { target, ok: true, failures })
  })

  // Cleanup on hot-reload: stop the cron so it isn't duplicated
  sdk.onReload(() => {
    stopPoll()
    sdk.log.info('system-ping cleanup complete')
  })

  sdk.log.info(`system-ping loaded — monitoring ${target}`)
}
```

---

## TypeScript example

For TypeScript plugins, use `import type` so the SDK package is erased by `tsc` and never bundled into your output — it is injected by MacroPad at runtime.

```ts
import type { MacroPadSDK } from '@macropad/plugin-sdk'

/**
 * system-ping TypeScript edition
 */
export default function plugin(sdk: MacroPadSDK): void {
  let target  = String(sdk.storage.get('target') ?? 'github.com')
  let failures = 0

  const stopPoll = sdk.cron(30000, async () => {
    try {
      await sdk.shell.execAsync(`ping -c 1 -W 3 ${target}`, { timeout: 5000 })
      sdk.broadcast('status', { target, ok: true, failures })
    } catch {
      failures++
      sdk.notify('system-ping', `${target} unreachable (failure #${failures})`)
    }
  })

  sdk.onAction('system-ping.setTarget', (params) => {
    target = String(params['host'] ?? 'github.com')
    sdk.storage.set('target', target)
  })

  sdk.onReload(() => stopPoll())
}
```

**Why `import type`?**
`import type` is erased completely by `tsc` — it produces zero bytes in the compiled output. This means `@macropad/plugin-sdk` only needs to be a `devDependency` in your `package.json`. If you used a plain `import`, the compiled JS would `require('@macropad/plugin-sdk')` at runtime and fail because the package is not present in the installed plugin directory.

**`tsconfig.json`** minimum required settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "strict": true,
    "outDir": "dist"
  }
}
```

Set `"main": "dist/index.js"` in `package.json` so MacroPad loads the compiled output.

---

## SDK reference

Every method available on the `sdk` object injected into your plugin factory.

### `sdk.pluginId` — `string`

The unique id declared in `manifest.json`. Use instead of hardcoding your plugin id.

```js
sdk.log.info(`Plugin loaded: ${sdk.pluginId}`)
```

---

### `sdk.onAction(key, fn)` — `void`

Register an action handler. `key` must match an entry in `manifest.json` `actions[].key`. The handler may be sync or async.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key`     | `string` | Action key (e.g. `"my-plugin.doThing"`) |
| `fn`      | `(params: Record<string, unknown>) => void \| Promise<void>` | Handler called when the action fires |

```js
sdk.onAction('my-plugin.doThing', async (params) => {
  const result = await sdk.http.get(`https://api.example.com/${params.id}`)
  sdk.broadcast('result', result)
})
```

---

### `sdk.broadcast(event, data?)` — `void`

Fan-out a named event to all connected PWA clients. Any plugin-tile component subscribed to `event` will receive the payload and update its display.

Rate limited to **30 broadcasts per second**.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event`   | `string` | Event name (e.g. `"status"`, `"cpu"`) |
| `data`    | `Record<string, unknown>` | Optional payload |

```js
sdk.broadcast('status', { cpu: 42, memory: 78, uptime: 3600 })
```

---

### `sdk.widget.set(actionKey, opts)` — `void`

Push a live display update to a specific component, identified by its action key. Updates are applied in real time without a page reload.

| Parameter | Type | Description |
|-----------|------|-------------|
| `actionKey` | `string` | The action key of the component to update |
| `opts.label` | `string?` | New text label |
| `opts.color` | `string?` | Background/accent color (CSS hex) |
| `opts.icon`  | `string?` | New icon (emoji or URL) |
| `opts.badge` | `string?` | Small badge text overlay |

```js
sdk.widget.set('my-plugin.counter', { label: String(count), badge: `×${count}` })
sdk.widget.set('my-plugin.toggle',  { color: active ? '#4ade80' : '#f87171', label: active ? 'ON' : 'OFF' })
```

---

### `sdk.widget.flash(actionKey, color, ms?)` — `void`

Briefly change a component's background color, then restore it. Good for visual acknowledgment of button presses.

| Parameter | Type | Description |
|-----------|------|-------------|
| `actionKey` | `string` | The action key of the component to flash |
| `color`     | `string` | CSS hex color, e.g. `"#4ade80"` |
| `ms`        | `number` | Duration in milliseconds. Default: `500` |

```js
sdk.widget.flash('my-plugin.button', '#60a5fa', 300)
```

---

### `sdk.notify(title, body?)` — `void`

Show a desktop notification via MacroPad.

Rate limited to **5 notifications per second**.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title`   | `string` | Notification title |
| `body`    | `string?` | Optional body text |

```js
sdk.notify('Build complete', 'All tests passed in 1.2s')
```

---

### `sdk.cron(intervalMs, fn)` — `() => void`

Schedule a recurring callback. Returns a stop function — **always** capture it and call it in `sdk.onReload` to prevent duplicate timers after hot-reload.

| Parameter | Type | Description |
|-----------|------|-------------|
| `intervalMs` | `number` | Interval in milliseconds |
| `fn`         | `() => void \| Promise<void>` | Callback |

Returns: `() => void` — call to cancel the interval.

```js
const stop = sdk.cron(5000, async () => {
  const data = await fetchStats()
  sdk.broadcast('stats', data)
})

sdk.onReload(() => stop())
```

---

### `sdk.storage.get(key)` — `unknown`

Get the persisted value for `key`, or `undefined` if not set.

```js
const count = Number(sdk.storage.get('count') ?? 0)
```

---

### `sdk.storage.getAll()` — `Record<string, unknown>`

Get a full snapshot of all key-value pairs for this plugin.

```js
const all = sdk.storage.getAll()
sdk.broadcast('storage-dump', all)
```

---

### `sdk.storage.set(key, value)` — `void`

Persist `value` for `key`. Values must be JSON-serialisable. Written to disk immediately.

```js
sdk.storage.set('count', count)
sdk.storage.set('settings', { theme: 'dark', interval: 5000 })
```

---

### `sdk.storage.delete(key)` — `void`

Remove a single key from storage.

```js
sdk.storage.delete('tempKey')
```

---

### `sdk.storage.clear()` — `void`

Wipe all stored data for this plugin.

```js
sdk.storage.clear()
```

---

### `sdk.shell.execAsync(cmd, opts?)` — `Promise<string>`

Run a shell command asynchronously. Resolves with trimmed stdout. **Preferred** over `execSync` for anything that takes more than ~50ms.

| Parameter | Type | Description |
|-----------|------|-------------|
| `cmd`     | `string` | Shell command |
| `opts.timeout` | `number?` | Timeout in ms. Default: `5000` |

```js
const out = await sdk.shell.execAsync('uptime')
sdk.broadcast('uptime', { text: out })
```

---

### `sdk.shell.execSync(cmd, opts?)` — `string`

Run a shell command synchronously. **Blocks the worker thread** until complete. Only use for instant reads (<50ms), e.g. `/proc` files.

```js
const hostname = sdk.shell.execSync('hostname')
```

---

### `sdk.http.get(url, opts?)` — `Promise<unknown>`

HTTP GET. Resolves with parsed JSON. Pass `raw: true` to get the raw `Response`.

Blocked for RFC1918/localhost addresses — use only for public endpoints.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url`     | `string` | Request URL (must be HTTPS for external requests) |
| `opts.timeout` | `number?` | Timeout in ms. Default: `8000` |
| `opts.headers` | `Record<string,string>?` | Extra headers |
| `opts.raw`     | `boolean?` | Return raw Response instead of parsed JSON |

```js
const data = await sdk.http.get('https://worldtimeapi.org/api/timezone/UTC')
const time = data.datetime
```

---

### `sdk.http.post(url, body, opts?)` — `Promise<unknown>`

HTTP POST with JSON body. Resolves with parsed JSON.

```js
await sdk.http.post('https://hooks.slack.com/services/xxx', {
  text: `Build passed at ${new Date().toISOString()}`
})
```

---

### `sdk.onReload(fn)` — `void`

Register a cleanup function called immediately before the plugin is hot-reloaded. Stop cron timers, close WebSocket connections, etc.

```js
const stop = sdk.cron(1000, tick)
const conn = new sdk.ws('wss://example.com/ws')

sdk.onReload(() => {
  stop()
  conn.close()
  sdk.log.info('cleanup complete')
})
```

---

### `sdk.ws` — WebSocket constructor

The `ws` package's `WebSocket` class, injected so your plugin does not need to bundle `ws` itself. Use for outbound WebSocket connections.

```js
const conn = new sdk.ws('wss://echo.websocket.org')
conn.on('open',    ()     => sdk.log.info('WS connected'))
conn.on('message', (data) => sdk.broadcast('wsMsg', { data: String(data) }))
conn.on('error',   (err)  => sdk.log.error('WS error:', err.message))
conn.on('close',   ()     => sdk.log.warn('WS disconnected'))

sdk.onReload(() => conn.close())
```

---

### `sdk.log.info(...args)` / `.warn(...args)` / `.error(...args)` — `void`

Log messages prefixed with `[plugin:id]` so you can identify which plugin logged a message in the MacroPad dev console.

```js
sdk.log.info('Plugin loaded', { version: '1.0.0' })
sdk.log.warn('Config missing, using defaults')
sdk.log.error('HTTP request failed', err.message)
```

---

## Testing

Install the testing helper as a dev dependency:

```sh
npm install --save-dev @macropad/plugin-sdk
```

Then import `createMockSDK` from `@macropad/plugin-sdk/testing`:

```js
const { createMockSDK } = require('@macropad/plugin-sdk/testing')
// or ESM:
import { createMockSDK } from '@macropad/plugin-sdk/testing'
```

### Basic test structure

```js
import { describe, test, expect } from 'vitest'
import { createMockSDK } from '@macropad/plugin-sdk/testing'
import myPlugin from '../index.js'

describe('my-plugin', () => {
  test('hello action sends a notification', async () => {
    const sdk = createMockSDK({ pluginId: 'my-plugin' })
    myPlugin(sdk)  // call the plugin factory — registers handlers

    await sdk.dispatch('my-plugin.hello', { name: 'World' })

    expect(sdk.notifications).toHaveLength(1)
    expect(sdk.notifications[0].title).toBe('Hello')
  })
})
```

### Mock capture arrays

All side effects are captured in arrays on the mock object:

| Property | Type | Captured from |
|----------|------|---------------|
| `sdk.broadcasts` | `[{ event, data }]` | `sdk.broadcast()` |
| `sdk.notifications` | `[{ title, body }]` | `sdk.notify()` |
| `sdk.widgetSets` | `[{ actionKey, opts }]` | `sdk.widget.set()` |
| `sdk.widgetFlashes` | `[{ actionKey, color, ms }]` | `sdk.widget.flash()` |
| `sdk.logs` | `[{ level, args }]` | `sdk.log.info/warn/error()` |
| `sdk.store` | `Record<string, unknown>` | Live storage reference |
| `sdk.handlers` | `Map<string, fn>` | `sdk.onAction()` |

### `sdk.dispatch(key, params?)`

Trigger a registered action handler as if MacroPad pressed it. Throws if no handler is registered for `key`.

```js
await sdk.dispatch('my-plugin.increment')
await sdk.dispatch('my-plugin.setTarget', { host: 'example.com' })
```

### `sdk.tickCron()`

Invoke every registered (non-stopped) cron callback once. Use this instead of fake timers when testing cron logic.

```js
myPlugin(sdk)
await sdk.tickCron()
expect(sdk.broadcasts).toHaveLength(1)
```

### `sdk.reload()`

Call the registered `onReload` cleanup function, simulating MacroPad hot-reloading the plugin.

```js
const mockStop = vi.fn()
// Plugin registers: const stop = sdk.cron(1000, fn); sdk.onReload(() => stop())
myPlugin(sdk)
sdk.reload()
// Verify cleanup ran
expect(sdk.broadcasts.filter(b => b.event === 'cleanup')).toHaveLength(1)
```

### Pre-populating storage

Pass initial storage values via the `storage` option:

```js
const sdk = createMockSDK({
  pluginId: 'my-plugin',
  storage: { count: 5, theme: 'dark' }
})
myPlugin(sdk)
// Plugin will read count=5 from storage on load
```

Or mutate `sdk.store` directly:

```js
const sdk = createMockSDK()
sdk.store['count'] = 5
myPlugin(sdk)
```

### Replacing SDK methods with vi.fn()

For shell, HTTP, or WebSocket tests, replace the default no-op with a mock:

```js
import { vi } from 'vitest'

const sdk = createMockSDK()
sdk.shell.execAsync = vi.fn().mockResolvedValue('localhost')
myPlugin(sdk)

await sdk.dispatch('my-plugin.getHostname')

expect(sdk.shell.execAsync).toHaveBeenCalledWith('hostname')
expect(sdk.broadcasts[0].data.hostname).toBe('localhost')
```

```js
sdk.http.get = vi.fn().mockResolvedValue({ datetime: '2026-05-01T00:00:00Z' })
await sdk.dispatch('my-plugin.getTime')
expect(sdk.broadcasts[0].data.time).toBe('2026-05-01T00:00:00Z')
```

---

## Manifest reference

`manifest.json` is required in every plugin. Use the `$schema` URL for IDE autocomplete:

```json
{
  "$schema": "https://raw.githubusercontent.com/chunkies/macropad/master/registry/manifest-schema.json",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does in one sentence.",
  "author": "Your Name",
  "license": "MIT",
  "icon": "🔌",
  "tags": ["productivity"],
  "minAppVersion": "1.0.0",
  "actions": [
    {
      "key": "my-plugin.doThing",
      "label": "Do the thing",
      "componentType": "button",
      "description": "Shown in the MacroPad action picker.",
      "params": [
        {
          "key": "message",
          "label": "Message",
          "type": "text",
          "placeholder": "Hello!",
          "default": "Hello!"
        }
      ]
    }
  ],
  "widgets": [
    {
      "key": "status",
      "label": "Status",
      "icon": "📊",
      "field": "text",
      "defaultColSpan": 2,
      "defaultRowSpan": 1,
      "description": "Live status text from sdk.broadcast('status', { text: '...' })"
    }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | `string` | No | Schema URL for IDE autocomplete |
| `id` | `string` | Yes | Unique identifier. Must match `/^[a-z0-9-]+$/`. Used as folder name. |
| `name` | `string` | Yes | Human-readable display name |
| `version` | `string` | Yes | Semantic version string, e.g. `"1.0.0"` |
| `description` | `string` | Yes | One-sentence description shown in the marketplace |
| `author` | `string` | Yes | Author name or handle |
| `license` | `string` | Yes | SPDX license identifier, e.g. `"MIT"` |
| `icon` | `string` | Yes | Emoji or image URL shown in the marketplace |
| `tags` | `string[]` | Yes | At least one tag for marketplace discovery |
| `minAppVersion` | `string` | No | Minimum MacroPad version required (semver) |
| `actions` | `PluginAction[]` | No | Action declarations for the action picker |
| `widgets` | `PluginWidget[]` | No | Widget declarations for the tile system |

### Action fields (`actions[]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Must be `"<plugin-id>.<name>"`, e.g. `"my-plugin.doThing"` |
| `label` | `string` | Yes | Shown in the action picker |
| `componentType` | `string` | No | Suggested component: `"button"`, `"switch"`, `"slider"`, `"knob"`, `"voice"`, `"trackpad"` |
| `description` | `string` | No | Shown as a tooltip in the action picker |
| `params` | `PluginParam[]` | No | User-configurable parameters |

### Param fields (`actions[].params[]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Parameter key in the `params` object received by your handler |
| `label` | `string` | Yes | Shown in the admin UI |
| `type` | `"text" \| "number" \| "textarea"` | No | Input type. Default: `"text"` |
| `default` | `string \| number` | No | Default value |
| `placeholder` | `string` | No | Placeholder text |

### Widget fields (`widgets[]`)

Widgets let a plugin-tile component on the PWA display live data from your plugin. MacroPad subscribes the tile to `sdk.broadcast(widget.key, payload)` and reads `payload[widget.field]` to display.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Matches the event name in `sdk.broadcast(key, ...)` |
| `label` | `string` | Yes | Shown in the widget picker |
| `description` | `string` | No | Help text in the widget picker |
| `icon` | `string` | No | Emoji shown in the widget picker |
| `field` | `string` | No | Which field of the broadcast payload to display. Default: `"value"` |
| `defaultColSpan` | `number` | No | Suggested column span when dropped onto the grid |
| `defaultRowSpan` | `number` | No | Suggested row span when dropped onto the grid |

---

## Security constraints

MacroPad runs each plugin in a `worker_threads` Worker with security restrictions:

### Blocked Node built-ins

The following modules are **blocked** and cannot be required or imported:

- `child_process` — use `sdk.shell.execAsync` / `sdk.shell.execSync` instead
- `net` — use `sdk.ws` for outbound WebSocket, `sdk.http` for HTTP
- `tls`
- `dgram` (UDP)
- `cluster`

### HTTP network restrictions

`sdk.http.get` and `sdk.http.post` block requests to:

- `localhost` / `127.x.x.x`
- RFC1918 private ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- IPv6 loopback `::1`

This prevents plugins from reaching internal network services or the MacroPad server itself.

### Rate limits

| Method | Limit |
|--------|-------|
| `sdk.broadcast()` | 30 per second |
| `sdk.notify()` | 5 per second |

Exceeding the limit silently drops the excess calls.

### Shell safety

Shell commands are validated against an injection-pattern regex before execution. Avoid constructing commands from untrusted user input. If you must include user input in a shell command, escape it:

```js
// Safe POSIX shell quoting: replace ' with '\''
const safe = userInput.replace(/'/g, "'\\''")
await sdk.shell.execAsync(`echo '${safe}'`)
```

---

## Publishing

1. **Create a GitHub repository** and push your plugin folder

2. **Tag a release**:
   ```sh
   git tag v1.0.0
   git push --tags
   ```

3. **Create a GitHub Release** for the tag and attach the plugin zip (or let GitHub Actions build it)

4. **Open a PR** to [chunkies/macropad](https://github.com/chunkies/macropad) adding your entry to `registry/registry.json`:
   ```json
   {
     "id": "my-plugin",
     "name": "My Plugin",
     "version": "1.0.0",
     "description": "What it does.",
     "author": "Your Name",
     "license": "MIT",
     "icon": "🔌",
     "tags": ["productivity"],
     "downloadUrl": "https://github.com/you/my-plugin/releases/download/v1.0.0/my-plugin-1.0.0.zip",
     "homepage": "https://github.com/you/my-plugin",
     "repo": "https://github.com/you/my-plugin",
     "price": 0,
     "minAppVersion": "1.0.0"
   }
   ```

See [registry/CONTRIBUTING.md](../registry/CONTRIBUTING.md) for the full submission guide and review criteria.
