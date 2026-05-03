#!/usr/bin/env node
'use strict'

const fs   = require('fs')
const path = require('path')

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const ts   = args.includes('--ts') || args.includes('--typescript')
const name = args.find(a => !a.startsWith('-'))

if (!name) {
  console.error('Usage: npx create-macropad-plugin <plugin-name> [--ts]')
  console.error('  plugin-name   lowercase letters, numbers, hyphens (e.g. my-plugin)')
  process.exit(1)
}

if (!/^[a-z0-9-]+$/.test(name)) {
  console.error(`Error: plugin name must be lowercase letters, numbers, and hyphens only.`)
  console.error(`  Got: "${name}"`)
  process.exit(1)
}

const repoName = `macropad-plugin-${name}`
const outDir   = path.resolve(process.cwd(), repoName)

if (fs.existsSync(outDir)) {
  console.error(`Error: directory "${repoName}" already exists.`)
  process.exit(1)
}

// ── Template helpers ──────────────────────────────────────────────────────────

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function f(file) { return path.join(outDir, file) }

// ── Shared files (JS + TS) ────────────────────────────────────────────────────

write(f('manifest.json'), JSON.stringify({
  $schema: 'https://raw.githubusercontent.com/chunkies/macropad/master/sdk/manifest.schema.json',
  id: name,
  name: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
  version: '1.0.0',
  description: 'A MacroPad plugin.',
  author: 'Your Name',
  icon: '🔌',
  license: 'MIT',
  minAppVersion: '1.0.0',
  actions: [
    {
      key: `${name}.hello`,
      label: 'Hello',
      componentType: 'button',
      description: 'Sends a test notification. Replace with your own action.',
      params: [
        { key: 'message', label: 'Message', type: 'text', placeholder: 'Hello from MacroPad!', default: 'Hello from MacroPad!' }
      ]
    }
  ]
}, null, 2) + '\n')

write(f('.gitignore'), [
  'node_modules/',
  'dist/',
  '*.log',
  '.DS_Store',
].join('\n') + '\n')

// ── Shared: GitHub Actions CI workflow ───────────────────────────────────────

write(f('.github/workflows/ci.yml'), `\
name: CI
on:
  push:
    branches: [master, main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm install
      - run: npm test
`)

// ── JavaScript ────────────────────────────────────────────────────────────────

if (!ts) {
  write(f('index.js'), `\
'use strict'

/**
 * ${name} — MacroPad plugin
 *
 * Receives an sdk instance and registers action handlers.
 * Called once when the plugin loads. Any sdk.cron() timers start immediately.
 */
module.exports = (sdk) => {
  sdk.log.info(\`${name} loaded (pluginId=\${sdk.pluginId})\`)

  // Register an action handler. The key must match an action in manifest.json.
  // params comes from the values the user configured in the admin panel.
  sdk.onAction('${name}.hello', async (params) => {
    const msg = params?.message || 'Hello from MacroPad!'
    sdk.notify('${name}', msg)
    sdk.log.info('hello action fired:', msg)
  })

  // Optional: run something on a timer.
  // sdk.cron(60_000, async () => {
  //   sdk.broadcast('status', { time: new Date().toISOString() })
  // })

  // Optional: clean up connections when the plugin hot-reloads.
  // sdk.onReload(() => { /* close ws connections, clear timers, etc. */ })
}
`)

  write(f('package.json'), JSON.stringify({
    name: repoName,
    version: '1.0.0',
    description: '',
    main: 'index.js',
    scripts: { test: 'vitest run', lint: 'eslint .' },
    devDependencies: {
      '@macropad/plugin-sdk': '^1.0.0',
      eslint: '^8',
      vitest: '^3',
    }
  }, null, 2) + '\n')

  write(f('.eslintrc.cjs'), `\
'use strict'
module.exports = {
  env: { node: true, es2020: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2020 },
  rules: { 'no-console': 'off' },
}
`)

  write(f('.vscode/launch.json'), JSON.stringify({
    version: '0.2.0',
    configurations: [
      {
        type: 'node',
        request: 'attach',
        name: 'Attach to MacroPad Plugin Worker',
        port: 9229,
        skipFiles: ['<node_internals>/**'],
        sourceMaps: true,
      }
    ]
  }, null, 2) + '\n')

  write(f('test/plugin.test.js'), `\
import { describe, test, expect, beforeEach } from 'vitest'
import { createMockSDK } from '@macropad/plugin-sdk/testing'
import plugin from '../index.js'

let sdk

beforeEach(() => {
  sdk = createMockSDK()
  plugin(sdk)
})

describe('${name}.hello', () => {
  test('sends a notification', async () => {
    await sdk.dispatch('${name}.hello', { message: 'Test' })
    expect(sdk.notifications).toHaveLength(1)
    expect(sdk.notifications[0].title).toBe('${name}')
    expect(sdk.notifications[0].body).toBe('Test')
  })

  test('falls back to default message', async () => {
    await sdk.dispatch('${name}.hello', {})
    expect(sdk.notifications[0].body).toBe('Hello from MacroPad!')
  })
})

describe('startup', () => {
  test('logs info on load', () => {
    const infoLogs = sdk.logs.filter(l => l.level === 'info')
    expect(infoLogs.length).toBeGreaterThanOrEqual(1)
  })

  test('registers hello handler', () => {
    expect(sdk.handlers['${name}.hello']).toBeTypeOf('function')
  })
})

describe('cron (optional — only if your plugin uses sdk.cron)', () => {
  test('tickCron runs without throwing', async () => {
    await expect(sdk.tickCron()).resolves.toBeUndefined()
  })
})

describe('broadcast (optional — only if your plugin uses sdk.broadcast)', () => {
  test('broadcasts array is accessible', () => {
    expect(sdk.broadcasts).toBeInstanceOf(Array)
  })
})
`)

  write(f('README.md'), `# macropad-plugin-${name}

A [MacroPad](https://github.com/chunkies/macropad) plugin.

## Install

Open MacroPad → Plugin Marketplace → Browse → find **${name}**.

## Development

\`\`\`bash
npm install
npm test
\`\`\`

Load locally: MacroPad → Marketplace → Developer → Load from folder.

## Publishing

1. Push to GitHub: \`github.com/you/macropad-plugin-${name}\`
2. Tag a release: \`git tag v1.0.0 && git push origin v1.0.0\`
3. Submit a PR to [chunkies/macropad](https://github.com/chunkies/macropad) adding your entry to \`registry/registry.json\`
`)
}

// ── TypeScript ────────────────────────────────────────────────────────────────

if (ts) {
  // Use 'import type' so tsc strips the import entirely — zero runtime SDK dependency.
  // The plugin zip installs and runs cleanly without @macropad/plugin-sdk in production.
  write(f('src/index.ts'), `\
import type { MacroPadSDK } from '@macropad/plugin-sdk'

/**
 * ${name} — MacroPad plugin
 *
 * Receives an sdk instance and registers action handlers.
 * Called once when the plugin loads. Any sdk.cron() timers start immediately.
 */
export default (sdk: MacroPadSDK) => {
  sdk.log.info(\`${name} loaded (pluginId=\${sdk.pluginId})\`)

  // Use a generic on onAction to type the params your action receives.
  sdk.onAction<{ message?: string }>('${name}.hello', async ({ message }) => {
    const msg = message || 'Hello from MacroPad!'
    sdk.notify('${name}', msg)
    sdk.log.info('hello action fired:', msg)
  })

  // Optional: run something on a timer.
  // sdk.cron(60_000, async () => {
  //   sdk.broadcast('status', { time: new Date().toISOString() })
  // })

  // Optional: clean up connections when the plugin hot-reloads.
  // sdk.onReload(() => { /* close ws connections, clear timers, etc. */ })
}
`)

  write(f('test/plugin.test.ts'), `\
import { describe, test, expect, beforeEach } from 'vitest'
import { createMockSDK, type MockSDK } from '@macropad/plugin-sdk/testing'
import plugin from '../src/index'

let sdk: MockSDK

beforeEach(() => {
  sdk = createMockSDK()
  plugin(sdk)
})

describe('${name}.hello', () => {
  test('sends a notification', async () => {
    await sdk.dispatch('${name}.hello', { message: 'Test' })
    expect(sdk.notifications).toHaveLength(1)
    expect(sdk.notifications[0].title).toBe('${name}')
    expect(sdk.notifications[0].body).toBe('Test')
  })

  test('falls back to default message', async () => {
    await sdk.dispatch('${name}.hello', {})
    expect(sdk.notifications[0].body).toBe('Hello from MacroPad!')
  })
})

describe('startup', () => {
  test('logs info on load', () => {
    const infoLogs = sdk.logs.filter(l => l.level === 'info')
    expect(infoLogs.length).toBeGreaterThanOrEqual(1)
  })

  test('registers hello handler', () => {
    expect(sdk.handlers['${name}.hello']).toBeTypeOf('function')
  })
})

describe('cron (optional — only if your plugin uses sdk.cron)', () => {
  test('tickCron runs without throwing', async () => {
    await expect(sdk.tickCron()).resolves.toBeUndefined()
  })
})

describe('broadcast (optional — only if your plugin uses sdk.broadcast)', () => {
  test('broadcasts array is accessible', () => {
    expect(sdk.broadcasts).toBeInstanceOf(Array)
  })
})
`)

  write(f('package.json'), JSON.stringify({
    name: repoName,
    version: '1.0.0',
    description: '',
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      dev: 'tsc --watch',
      test: 'vitest run',
      lint: 'eslint .',
    },
    devDependencies: {
      '@macropad/plugin-sdk': '^1.0.0',
      '@typescript-eslint/eslint-plugin': '^7',
      '@typescript-eslint/parser': '^7',
      eslint: '^8',
      typescript: '^5',
      vitest: '^3',
    }
  }, null, 2) + '\n')

  write(f('.eslintrc.cjs'), `\
'use strict'
module.exports = {
  env: { node: true, es2020: true },
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: { 'no-console': 'off' },
}
`)

  write(f('.vscode/launch.json'), JSON.stringify({
    version: '0.2.0',
    configurations: [
      {
        type: 'node',
        request: 'attach',
        name: 'Attach to MacroPad Plugin Worker',
        port: 9229,
        skipFiles: ['<node_internals>/**'],
        sourceMaps: true,
        outFiles: ['${workspaceFolder}/dist/**/*.js'],
      }
    ]
  }, null, 2) + '\n')

  write(f('tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020', 'DOM'],
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src'],
    exclude: ['node_modules', 'dist', 'test'],
  }, null, 2) + '\n')

  write(f('README.md'), `# macropad-plugin-${name}

A [MacroPad](https://github.com/chunkies/macropad) plugin, written in TypeScript.

## Install

Open MacroPad → Plugin Marketplace → Browse → find **${name}**.

## Development

\`\`\`bash
npm install
npm run dev      # watch mode — rebuilds on save
npm test         # run unit tests
\`\`\`

Load locally (no build needed in dev mode): MacroPad → Marketplace → Developer → Load from folder — point it at this directory.

> **Tip:** Run \`npm run dev\` in a terminal while developing. MacroPad auto-reloads plugins when files change.

## Publishing

1. Build: \`npm run build\`
2. Push to GitHub: \`github.com/you/macropad-plugin-${name}\`
3. Tag a release: \`git tag v1.0.0 && git push origin v1.0.0\`
4. Submit a PR to [chunkies/macropad](https://github.com/chunkies/macropad) adding your entry to \`registry/registry.json\`
`)
}

// ── Done ──────────────────────────────────────────────────────────────────────

const files = []
function listFiles(dir, base = '') {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const rel  = base ? `${base}/${entry}` : entry
    if (fs.statSync(full).isDirectory()) listFiles(full, rel)
    else files.push(rel)
  }
}
listFiles(outDir)

console.log(`\nCreated ${repoName}/`)
for (const file of files) console.log(`  ${file}`)

console.log(`
Next steps:

  cd ${repoName}
${ts ? '  npm install          # install dev dependencies\n  npm run dev          # TypeScript watch mode\n' : '  npm install          # install dev dependencies\n'}\
  # Load in MacroPad: Marketplace → Developer → Load from folder

When ready to publish:

  1. Create a GitHub repo:  github.com/you/${repoName}
  2. git init && git add -A && git commit -m "feat: initial release v1.0.0"
  3. git remote add origin https://github.com/you/${repoName}.git
  4. git push -u origin master
  5. git tag v1.0.0 && git push origin v1.0.0
  6. Open a PR to github.com/chunkies/macropad — add your entry to registry/registry.json

  Dev console: In MacroPad → Marketplace → Installed → open the ▶ Developer Console for this plugin
  Docs:        https://chunkies.github.io/macropad
`)
