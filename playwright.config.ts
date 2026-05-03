import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: '.',
  testIgnore: ['**/.claude/**', '**/node_modules/**'],
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',

  projects: [
    // PWA tests — serve pwa/ statically, mock WebSocket via addInitScript
    {
      name: 'pwa',
      testMatch: 'pwa/tests/e2e/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Renderer tests — launch Electron with the built app
    {
      name: 'renderer',
      testMatch: 'electron/tests/e2e/**/*.spec.ts',
    },
  ],

  // Static file server for PWA tests
  webServer: {
    command: `node -e "
      const http = require('http');
      const fs = require('fs');
      const path = require('path');
      const mimes = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml' };
      http.createServer((req, res) => {
        let fp = path.join('${path.resolve('dist/pwa')}', req.url === '/' ? '/index.html' : req.url);
        try {
          const data = fs.readFileSync(fp);
          res.writeHead(200, {'Content-Type': mimes[path.extname(fp)] || 'text/plain', 'Access-Control-Allow-Origin': '*'});
          res.end(data);
        } catch {
          res.writeHead(404); res.end();
        }
      }).listen(5174, () => console.log('PWA server ready on 5174'));
    "`,
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
})
