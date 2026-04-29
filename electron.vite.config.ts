import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'

function copyDirSync(src: string, dest: string): void {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const file of readdirSync(src)) {
    const s = `${src}/${file}`
    const d = `${dest}/${file}`
    if (statSync(s).isDirectory()) {
      copyDirSync(s, d)
    } else {
      copyFileSync(s, d)
    }
  }
}

// Copies src/server/** to out/server/ so dynamic requires from out/main/ resolve correctly
function copyServerPlugin() {
  return {
    name: 'copy-server',
    buildStart() {
      copyDirSync('src/server', 'out/server')
    },
    closeBundle() {
      copyDirSync('src/server', 'out/server')
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyServerPlugin()],
    build: {
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index:       resolve('src/preload/index.ts'),
          marketplace: resolve('src/preload/marketplace.ts'),
        },
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index:       resolve('src/renderer/index.html'),
          marketplace: resolve('src/renderer/marketplace.html'),
        },
      },
    },
  },
})
