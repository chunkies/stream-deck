# MacroPad — Claude Code Instructions

## Before Marking Any Task Done

Run these in order — all must pass:

1. `npm run typecheck` — zero errors across all three tsconfigs
2. `npm run lint` — zero violations
3. `npm test` — all tests green (unit + renderer + pwa workspaces)
4. For any UI or feature change: run `npm run dev` and manually verify the golden path works. If you cannot test the UI, say "I cannot verify UI — manual test required" explicitly.

## Code Rules

- No `any` in production TypeScript (`electron/`, `pwa/src/`). Test files may use it sparingly.
- No commented-out code, no debug `console.log` left in.
- No scope creep — implement exactly what was asked, nothing more.
- No half-finished code. If a function is stubbed, mark it `throw new Error('not implemented')`.

## Tests Are Required

Every new exported function or module needs unit tests before the task is done:

| What changed | Test location |
|---|---|
| `electron/server/**` | `electron/tests/server/` (vitest/node) |
| `electron/renderer/**` | `electron/tests/renderer/` (vitest/jsdom) |
| `pwa/src/**` | `pwa/tests/` (vitest/browser) |

Run `npm test` to verify all three workspaces pass.

## Deploy Gate — NEVER Without Explicit Instruction

**Do not:**
- Run `electron-builder`, `npm run package`, or any `package:*` script
- Push a git tag (tags trigger the CI release pipeline)
- Create or publish a GitHub Release
- Commit anything in `dist/` or `releases/`

Releases happen only when Tristan explicitly says to deploy. The CI pipeline handles packaging automatically on tag push — do not trigger it manually.

## Build System Quick Reference

```
npm run build       — full build (server tsc + pwa vite + electron-vite)
npm run dev         — dev mode with hot reload
npm test            — unit tests (all vitest workspaces)
npm run test:e2e    — Playwright E2E (pwa + renderer)
npm run typecheck   — tsc --noEmit for all three tsconfigs
npm run lint        — ESLint over electron/ and pwa/src/
```

Three tsconfigs:
- `tsconfig.node.json` — main process + preload
- `tsconfig.web.json` — renderer
- `tsconfig.server.json` — server (compiled to dist/ by npm test)

## Architecture Notes

- Plugin sandboxing: each plugin runs in a `worker_threads` Worker (5s startup, 10s action timeouts)
- WebSocket: PWA ↔ server on port 3000 (rate limited 60 msg/s)
- All user data rendered via `textContent` — no `innerHTML` with user content
- Shell commands validated against SHELL_INJECT regex before `execSync`
- Auto-updater: `electron-updater` wired in main, only runs when `app.isPackaged`
