# MacroPad — Phone Macro Pad

Turn any phone into a programmable control surface. Tap buttons on your phone to run shell commands, trigger hotkeys, control OBS, fire macros, and more — all over local WiFi.

**[Landing Page](https://chunkies.github.io/macropad/landing/)** · **[Plugin SDK Docs](https://chunkies.github.io/macropad/docs/)**

---

## What it is

A phone PWA + Electron desktop app connected over WebSocket. The phone shows a configurable grid of buttons. Tap a button → command runs on your PC. No cloud, no account, no latency.

```
Phone (iOS/Android)         PC (Linux/Mac/Windows)
  Grid of buttons      →    Electron app
  Tap → WebSocket      →    Runs shell command / hotkey / plugin action
  Swipe → next page
```

## Download

| Platform | Download |
|----------|----------|
| Linux    | [AppImage](https://github.com/chunkies/macropad/releases/latest/download/macropad-linux.AppImage) · [.deb](https://github.com/chunkies/macropad/releases/latest/download/macropad-linux.deb) |
| macOS    | [.dmg (Intel + Apple Silicon)](https://github.com/chunkies/macropad/releases/latest/download/macropad-mac.dmg) |
| Windows  | [Setup.exe](https://github.com/chunkies/macropad/releases/latest/download/macropad-setup.exe) |

Or [build from source](#build-from-source).

## Quick start

1. Download and run the app for your OS
2. The admin panel shows a QR code — scan it on your phone
3. Click any empty cell to add a button
4. Configure the action (hotkey, command, plugin, etc.)
5. Press it from your phone

The phone UI is a PWA — no app install required. On iOS, tap Share → Add to Home Screen for a full-screen experience.

## Button types

| Type | Description |
|------|-------------|
| **Button** | Press → run action. Optional hold action (500ms). |
| **Toggle** | Stateful on/off. Separate icon/label/color per state. |
| **Slider** | Vertical drag. `{value}` interpolated into command. |
| **Tile** | Live data display. Polls a shell command every N seconds. |
| **Spotify** | Album art + track info. Tap to play/pause. Uses MPRIS (no API key). |
| **Voice** | Hold → speak → AI matches intent to a button or runs a command. |

## Action types

| Action | Description |
|--------|-------------|
| Built-in | Media controls, volume, lock, sleep, screenshot — cross-platform |
| Hotkey | xdotool format (`ctrl+shift+f5`) — auto-converted for Mac/Windows |
| Command | Any shell command |
| Sequence | Multiple commands with configurable delay between them |
| OBS | Switch scene, toggle recording/streaming, mute source |
| Plugin | Any action from an installed community plugin |
| Page link | Navigate to another page of buttons |

## Plugin ecosystem

Plugins are two files (`manifest.json` + `index.js`) with access to a full SDK:

```js
module.exports = (sdk) => ({
  'my-plugin.action': async (params) => {
    const out = await sdk.shell.execAsync('date')
    sdk.storage.set('lastRun', out)
    sdk.broadcast({ event: 'update', value: out })
  }
})
```

SDK methods: `shell.exec/execAsync`, `storage.get/set/delete/clear`, `http.get/post/request`, `broadcast`, `log.info/warn/error`.

**Install plugins** from the marketplace (🔌 Plugins button in the sidebar). Community plugins submit a PR to [`registry/registry.json`](registry/registry.json).

**[Full plugin SDK docs →](docs/index.html)**

## Voice button

The voice button uses the browser's Web Speech API — no server-side processing. Three modes:

- **Smart** — speaks a button label, AI matches it to the closest configured button and fires it
- **Command** — transcript is executed directly as a shell command
- **AI (Claude)** — transcript sent to Claude (Haiku) with full button context; Claude picks the right action. Requires a Claude API key in Settings.

## Cross-platform built-ins

| Action | Linux | macOS | Windows |
|--------|-------|-------|---------|
| Play/Pause | `playerctl play-pause` | `playerctl play-pause` | `keybd_event(0xB3)` |
| Volume | `wpctl` | `osascript` | `keybd_event(0xAF/0xAE)` |
| Lock | `xdg-screensaver lock` | `osascript` keystroke | `rundll32 LockWorkStation` |
| Sleep | `systemctl suspend` | `pmset sleepnow` | `rundll32 SetSuspendState` |

## Build from source

```bash
git clone https://github.com/chunkies/macropad
cd macropad/electron
npm install
npm start              # dev mode
npm run build:linux    # AppImage + .deb
npm run build:mac      # .dmg (Intel + arm64)
npm run build:win      # NSIS installer
npm run build:all      # all platforms
npm test               # run unit tests
```

Requires Node 20+, Electron 30.

## Architecture

```
electron/
  main.js              — Electron entry, IPC, marketplace window
  preload.js           — contextBridge → window.api
  preload-marketplace.js — contextBridge → window.mp
  server/
    index.js           — HTTPS + WSS server, config, tile polling, Spotify
    plugin-sdk.js      — SDK factory for plugins
    plugin-installer.js — download, extract, semver, update checks
    keyboard.js        — cross-platform hotkey/builtin execution
    cert.js            — self-signed TLS cert generation
  renderer/
    index.html/renderer.js/styles.css — admin panel
    marketplace.html/marketplace.js   — plugin marketplace
pwa/
  index.html/app.js/styles.css       — phone PWA
plugins-example/
  hello-world/         — minimal plugin (plain object export)
  system-info/         — full SDK showcase
  text-macro/          — type text + pause + hotkey, per-button params
registry/
  registry.json        — community plugin listing
landing/
  index.html           — download landing page
docs/
  index.html           — plugin SDK documentation
```

## Contributing

- **Bug reports / feature requests**: [open an issue](https://github.com/chunkies/macropad/issues)
- **New plugin**: add two files and submit a PR adding your entry to `registry/registry.json`
- **Core changes**: PRs welcome — keep it simple, no unnecessary dependencies

## License

MIT
