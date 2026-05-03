import { defineConfig } from 'vite'
import { resolve }      from 'path'

export default defineConfig({
  root: resolve(__dirname, 'pwa'),
  build: {
    outDir:      resolve(__dirname, 'dist/pwa'),
    emptyOutDir: true,
  },
})
