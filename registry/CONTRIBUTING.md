# Contributing a plugin to the MacroPad Registry

This guide covers everything you need to know to submit a third-party plugin to the MacroPad marketplace.

---

## Table of contents

1. [Plugin repository structure](#plugin-repository-structure)
2. [registry.json entry format](#registryjson-entry-format)
3. [How the install flow works](#how-the-install-flow-works)
4. [Review criteria checklist](#review-criteria-checklist)
5. [Versioning](#versioning)
6. [Common mistakes](#common-mistakes)

---

## Plugin repository structure

Your plugin must live in its own GitHub repository. The repository root is what gets zipped and distributed.

**Required files:**

```
my-plugin/
  manifest.json        # plugin metadata and action declarations (required)
  index.js             # entry point loaded by MacroPad (required, or see main below)
```

**Optional but common:**

```
  package.json         # if present, MacroPad runs `npm install --omit=dev` after extracting
  README.md            # shown to users
  .gitignore
  tests/
    index.test.js
```

**TypeScript plugins** (compiled before release):

```
  src/index.ts         # source (not distributed in the zip)
  dist/index.js        # compiled output (this is what MacroPad loads)
  package.json         # must have "main": "dist/index.js"
  tsconfig.json
```

### `package.json` requirements

If your plugin has a `package.json`, MacroPad uses the `main` field to determine which file to load.

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "some-library": "^1.0.0"
  },
  "devDependencies": {
    "@macropad/plugin-sdk": "^1.0.0",
    "vitest": "^2.0.0"
  }
}
```

**Rules:**
- `"main"` must point to the file that exports the plugin factory (or handlers object). Default: `index.js`.
- `@macropad/plugin-sdk` must be in `devDependencies`, **not** `dependencies`. It is injected by MacroPad at runtime.
- Any package in `dependencies` will be installed by `npm install --omit=dev` during plugin install.
- `devDependencies` are **not** installed — keep test tools and type packages there.

---

## registry.json entry format

When opening a PR, add one entry to the `plugins` array in `registry/registry.json`.

### Full example

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "One sentence that explains what the plugin does.",
  "author": "Your Name or Handle",
  "authorUrl": "https://github.com/you",
  "homepage": "https://github.com/you/my-plugin",
  "repo": "https://github.com/you/my-plugin",
  "icon": "🔌",
  "price": 0,
  "purchaseUrl": "",
  "downloadUrl": "https://github.com/you/my-plugin/releases/download/v1.0.0/my-plugin-1.0.0.zip",
  "license": "MIT",
  "tags": ["productivity", "automation"],
  "downloads": 0,
  "minAppVersion": "1.0.0",
  "widgets": [
    {
      "key": "status",
      "label": "Status",
      "icon": "📊",
      "field": "text",
      "defaultColSpan": 2,
      "defaultRowSpan": 1,
      "description": "Live status text"
    }
  ]
}
```

### Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier. Must match `manifest.json` id and the folder name MacroPad creates. Pattern: `/^[a-z0-9-]+$/`. |
| `name` | `string` | Yes | Human-readable display name shown in the marketplace |
| `version` | `string` | Yes | Semantic version of the current release, e.g. `"1.0.0"` |
| `description` | `string` | Yes | One-sentence description. Keep it concise. |
| `author` | `string` | Yes | Author name, handle, or organisation |
| `authorUrl` | `string` | No | URL to the author's GitHub profile or website |
| `homepage` | `string` | No | Plugin homepage or documentation URL (must be `https://`) |
| `repo` | `string` | No | Source repository URL (must be `https://`). Required for verified badge. |
| `icon` | `string` | Yes | Emoji or image URL shown in the marketplace |
| `price` | `number` | Yes | `0` for free plugins. Paid plugin support is coming — leave `0` for now. |
| `purchaseUrl` | `string` | No | Leave empty for free plugins |
| `downloadUrl` | `string` | Yes | Direct download URL for the plugin zip. Must be `https://`. The CI will verify this returns HTTP 200. |
| `license` | `string` | Yes | SPDX licence identifier, e.g. `"MIT"`, `"Apache-2.0"`, `"GPL-3.0"` |
| `tags` | `string[]` | Yes | At least one tag for marketplace search and filtering |
| `downloads` | `number` | Yes | Set to `0` for new entries. Updated by the registry tooling. |
| `minAppVersion` | `string` | No | Minimum MacroPad version required, e.g. `"1.0.0"` |
| `widgets` | `object[]` | No | Widget declarations (see below). Only include if your plugin broadcasts tile-compatible events. |

### Widget fields (`widgets[]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Must match the event name in `sdk.broadcast(key, payload)` |
| `label` | `string` | Yes | Widget name shown in the tile picker |
| `description` | `string` | No | Help text shown in the tile picker |
| `icon` | `string` | No | Emoji or image URL |
| `field` | `string` | No | Which field of the broadcast payload to display. Default: `"value"` |
| `defaultColSpan` | `number` | No | Suggested column span for the tile. Default: `2` |
| `defaultRowSpan` | `number` | No | Suggested row span for the tile. Default: `1` |

---

## How the install flow works

Understanding the install flow helps you build a zip that installs cleanly.

1. **Download** — MacroPad fetches the zip from `downloadUrl`
2. **Extract** — The zip is extracted to a temp directory
3. **Flatten** — If the zip has a single top-level directory (e.g. `my-plugin-1.0.0/`), its contents are moved up one level. This is the standard GitHub archive format. The result is a flat directory named after the plugin id.
4. **Manifest check** — `manifest.json` must exist at the root of the extracted directory
5. **ID validation** — `manifest.json`.id must match the registry entry `id`
6. **Version check** — `manifest.json`.minAppVersion is compared to the running MacroPad version. Install fails if MacroPad is too old.
7. **npm install** — If `package.json` exists, MacroPad runs `npm install --omit=dev --no-audit --no-fund` in the plugin directory. This installs only `dependencies`, not `devDependencies`.
8. **Load** — MacroPad `require()`s the file pointed to by `package.json` `main` (or `index.js` if no `package.json`). The export must be a function `(sdk) => void` or a plain object of `{ [actionKey]: handler }`.

**What this means for your zip structure:**

Both of these work:
```
# Flat (preferred):
my-plugin-1.0.0.zip
  manifest.json
  index.js
  package.json

# GitHub archive style (also works — top dir is stripped):
my-plugin-1.0.0.zip
  my-plugin-1.0.0/
    manifest.json
    index.js
    package.json
```

---

## Review criteria checklist

Before opening a PR, verify your submission meets all of these:

**Registry entry**
- [ ] `id` matches `manifest.json` `id` and follows `/^[a-z0-9-]+$/`
- [ ] `version` matches the version in `manifest.json`
- [ ] `downloadUrl` is a direct download link that returns HTTP 200
- [ ] The zip at `downloadUrl` contains `manifest.json` with a matching `id`
- [ ] `license` is a valid SPDX identifier
- [ ] `author` and `description` are non-empty
- [ ] At least one `tag`

**Plugin code**
- [ ] Plugin entry point exports a function `(sdk) => void` (or a handlers object)
- [ ] All action keys are prefixed with the plugin id: `"my-plugin.doThing"` not `"doThing"`
- [ ] `@macropad/plugin-sdk` is in `devDependencies`, **not** `dependencies`
- [ ] `package.json` `main` field points to the correct entry file (if using TypeScript: compiled output in `dist/`)
- [ ] No use of blocked built-ins: `child_process`, `net`, `tls`, `dgram`, `cluster` — use SDK methods instead
- [ ] No hardcoded plugin id strings — use `sdk.pluginId`
- [ ] `sdk.onReload` is used to stop any cron timers or close WebSocket connections

**Quality**
- [ ] Unit tests exist (vitest recommended) and pass
- [ ] Plugin works with the listed `minAppVersion`
- [ ] README explains what the plugin does and how to configure it

**Maintainer checks** (done during review)
- The `downloadUrl` is verified by the `registry-check` CI workflow — it must return HTTP 200 and the zip must contain `manifest.json` with matching `id`
- The `validate:registry` script must pass with your new entry
- No duplicate `id` in the registry

---

## Versioning

MacroPad uses **semantic versioning** (`MAJOR.MINOR.PATCH`):

| Change type | Version bump | Example |
|-------------|-------------|---------|
| Bug fix, no new features or breaking changes | `PATCH` | `1.0.0` → `1.0.1` |
| New action, new widget, new config option | `MINOR` | `1.0.1` → `1.1.0` |
| Removed action, renamed action key, changed param format | `MAJOR` | `1.1.0` → `2.0.0` |

**When to update the registry:**

Every time you publish a new release with a changed version:
1. Tag the release: `git tag v1.1.0 && git push --tags`
2. Create a GitHub Release and attach the updated zip
3. Open a PR to update `version` and `downloadUrl` in `registry.json`

**Never change the `id`.** MacroPad uses `id` as the install folder name — changing it would break existing installations.

---

## Common mistakes

### Wrong `main` in package.json

**Problem:** Plugin fails to load with "Cannot find module" after install.

**Cause:** `package.json` `main` points to a file that doesn't exist in the zip — for example, TypeScript source at `src/index.ts` instead of compiled output at `dist/index.js`.

**Fix:** Always compile TypeScript before creating a release zip. Set `"main": "dist/index.js"` and include the `dist/` directory in the zip.

---

### SDK package in `dependencies` instead of `devDependencies`

**Problem:** `npm install` during plugin install tries to download `@macropad/plugin-sdk` from npm, fails, or installs an outdated version that doesn't match the runtime.

**Cause:** `@macropad/plugin-sdk` in `"dependencies"` instead of `"devDependencies"`.

**Fix:** Move it to `devDependencies`. MacroPad injects the SDK at runtime — you should never bundle it.

```json
{
  "devDependencies": {
    "@macropad/plugin-sdk": "^1.0.0"
  }
}
```

---

### Action key not prefixed with plugin id

**Problem:** Actions work in dev mode but conflict with other plugins after install.

**Cause:** Action keys like `"start"`, `"toggle"`, `"reset"` without a plugin-id prefix.

**Fix:** Always prefix every action key with your plugin id:

```json
{ "key": "my-plugin.start" }
{ "key": "my-plugin.toggle" }
{ "key": "my-plugin.reset" }
```

And in your handler registrations:
```js
sdk.onAction('my-plugin.start', () => { ... })
```

---

### Cron timer not stopped on reload

**Problem:** After hot-reloading the plugin in the MacroPad UI, CPU usage climbs and duplicate broadcasts appear.

**Cause:** Cron timer started in the plugin factory but `sdk.onReload` is not used to stop it.

**Fix:**

```js
module.exports = (sdk) => {
  const stop = sdk.cron(5000, tick)   // capture the stop function
  sdk.onReload(() => stop())           // always call it on reload
}
```

---

### `downloadUrl` pointing to a GitHub source archive

**Problem:** CI check fails because the zip doesn't have `manifest.json` at the expected path.

**Cause:** Using a GitHub source archive URL like `https://github.com/you/repo/archive/refs/tags/v1.0.0.zip`. These include the repository source tree in a subdirectory named `repo-1.0.0/` — which is fine for MacroPad's flattening logic, BUT the archive must contain `manifest.json` in the root of that subdirectory.

**Fix:** Make sure `manifest.json` and your entry file are committed to the repository root (not inside a subdirectory). Then either:
- Use the GitHub source archive URL (works if manifest.json is at the repo root), or
- Attach a custom-built zip to a GitHub Release

---

### Hardcoded plugin id

**Problem:** Plugin breaks if the id is ever changed, and is harder to test.

**Cause:** Strings like `'my-plugin.start'` scattered throughout handler code.

**Fix:** Use `sdk.pluginId` for everything that needs the id dynamically:

```js
sdk.log.info(`Plugin loaded: ${sdk.pluginId}`)
sdk.broadcast('status', { source: sdk.pluginId, value: 42 })
```

Action key strings in `sdk.onAction('...')` calls must still be hardcoded string literals to match `manifest.json` — but that's fine since they're declaration-time, not runtime.
