import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron/main',
      lib: {
        entry: resolve('electron/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron/preload',
      rollupOptions: {
        input: {
          index:       resolve('electron/preload/index.ts'),
          marketplace: resolve('electron/preload/marketplace.ts'),
        },
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: 'electron/renderer',
    build: {
      outDir: 'dist/electron/renderer',
      rollupOptions: {
        input: {
          index:       resolve('electron/renderer/index.html'),
          marketplace: resolve('electron/renderer/marketplace.html'),
        },
      },
    },
  },
})
