import type { Page, Component } from '../../shared/types'
import { state } from './state'
import { pushConfig } from './config'
import { renderAll } from './grid'

export interface LayoutTemplate {
  id:          string
  name:        string
  description: string
  icon:        string
  page:        Page
}

// ── Template definitions ────────────────────────────────────────────────────

const gamingPage: Page = {
  id: 'tpl-g',
  name: 'Gaming',
  cols: 3,
  components: [
    { id: 'tpl-g-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'OBS Record', icon: '⏺', color: '#dc2626', action: { type: 'hotkey', combo: 'ctrl+shift+r' } },
    { id: 'tpl-g-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Discord Mute', icon: '🎙', color: '#5865f2', action: { type: 'hotkey', combo: 'ctrl+shift+m' } },
    { id: 'tpl-g-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'slider',  label: 'Volume', icon: '🔊', color: '#1e293b', action: { type: 'volume' }, min: 0, max: 100, step: 5, defaultValue: 50 },
    { id: 'tpl-g-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'F1', icon: '①', color: '#1e293b', action: { type: 'hotkey', combo: 'F1' } },
    { id: 'tpl-g-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'F2', icon: '②', color: '#1e293b', action: { type: 'hotkey', combo: 'F2' } },
    { id: 'tpl-g-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'F3', icon: '③', color: '#1e293b', action: { type: 'hotkey', combo: 'F3' } },
    { id: 'tpl-g-7', col: 1, row: 3, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'F4', icon: '④', color: '#1e293b', action: { type: 'hotkey', combo: 'F4' } },
    { id: 'tpl-g-8', col: 2, row: 3, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'F5', icon: '⑤', color: '#1e293b', action: { type: 'hotkey', combo: 'F5' } },
  ],
}

const musicPage: Page = {
  id: 'tpl-m',
  name: 'Music',
  cols: 3,
  components: [
    { id: 'tpl-m-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Prev', icon: '⏮', color: '#1e293b', action: { type: 'command', command: 'playerctl previous' } },
    { id: 'tpl-m-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Play/Pause', icon: '⏯', color: '#16a34a', action: { type: 'command', command: 'playerctl play-pause' } },
    { id: 'tpl-m-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Next', icon: '⏭', color: '#1e293b', action: { type: 'command', command: 'playerctl next' } },
    { id: 'tpl-m-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Shuffle', icon: '🔀', color: '#7c3aed', action: { type: 'command', command: 'playerctl shuffle Toggle' } },
    { id: 'tpl-m-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Repeat', icon: '🔁', color: '#0284c7', action: { type: 'command', command: 'playerctl loop Playlist' } },
    { id: 'tpl-m-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'slider',  label: 'Volume', icon: '🔊', color: '#1e293b', action: { type: 'volume' }, min: 0, max: 100, step: 5, defaultValue: 50 },
    { id: 'tpl-m-7', col: 1, row: 3, colSpan: 3, rowSpan: 1, componentType: 'spotify', label: 'Spotify', color: '#0f172a' },
  ],
}

const obsPage: Page = {
  id: 'tpl-o',
  name: 'OBS Studio',
  cols: 3,
  components: [
    { id: 'tpl-o-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene 1', icon: '1️⃣', color: '#1e293b', action: { type: 'hotkey', combo: 'ctrl+F1' } },
    { id: 'tpl-o-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene 2', icon: '2️⃣', color: '#1e293b', action: { type: 'hotkey', combo: 'ctrl+F2' } },
    { id: 'tpl-o-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene 3', icon: '3️⃣', color: '#1e293b', action: { type: 'hotkey', combo: 'ctrl+F3' } },
    { id: 'tpl-o-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'switch', label: 'Record', icon: '⏺', color: '#dc2626', activeColor: '#ef4444', action: { type: 'hotkey', combo: 'ctrl+shift+r' } },
    { id: 'tpl-o-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'switch', label: 'Stream', icon: '📡', color: '#7c3aed', activeColor: '#a855f7', action: { type: 'hotkey', combo: 'ctrl+shift+s' } },
    { id: 'tpl-o-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Mute Src', icon: '🔇', color: '#475569', action: { type: 'hotkey', combo: 'ctrl+shift+m' } },
  ],
}

const devPage: Page = {
  id: 'tpl-d',
  name: 'Development',
  cols: 3,
  components: [
    { id: 'tpl-d-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Terminal', icon: '💻', color: '#1e293b', action: { type: 'hotkey', combo: 'ctrl+alt+t' } },
    { id: 'tpl-d-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Git Commit', icon: '✅', color: '#16a34a', action: { type: 'command', command: 'git commit' } },
    { id: 'tpl-d-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Git Push', icon: '🚀', color: '#0284c7', action: { type: 'command', command: 'git push' } },
    { id: 'tpl-d-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Git Pull', icon: '⬇', color: '#7c3aed', action: { type: 'command', command: 'git pull' } },
    { id: 'tpl-d-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Build', icon: '🔨', color: '#d97706', action: { type: 'command', command: 'npm run build' } },
    { id: 'tpl-d-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Tests', icon: '🧪', color: '#0f766e', action: { type: 'command', command: 'npm test' } },
  ],
}

const haPage: Page = {
  id: 'tpl-h',
  name: 'Home Assistant',
  cols: 3,
  components: [
    { id: 'tpl-h-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Lights On', icon: '💡', color: '#d97706', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/lights-on', method: 'POST' } },
    { id: 'tpl-h-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Lights Off', icon: '🌑', color: '#1e293b', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/lights-off', method: 'POST' } },
    { id: 'tpl-h-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene: Movie', icon: '🎬', color: '#7c3aed', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/scene-movie', method: 'POST' } },
    { id: 'tpl-h-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene: Work', icon: '🏢', color: '#0284c7', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/scene-work', method: 'POST' } },
    { id: 'tpl-h-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Scene: Night', icon: '🌙', color: '#0f172a', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/scene-night', method: 'POST' } },
    { id: 'tpl-h-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Alarm Off', icon: '🔔', color: '#dc2626', action: { type: 'webhook', url: 'http://homeassistant.local:8123/api/webhook/alarm-off', method: 'POST' } },
  ],
}

const productivityPage: Page = {
  id: 'tpl-p',
  name: 'Productivity',
  cols: 3,
  components: [
    { id: 'tpl-p-1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'countdown', label: 'Pomodoro', icon: '🍅', color: '#dc2626', duration: 1500 },
    { id: 'tpl-p-2', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: 'stopwatch', label: 'Stopwatch', icon: '⏱', color: '#0284c7' },
    { id: 'tpl-p-3', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: 'clock',     label: 'Clock',     icon: '🕐', color: '#1e293b', clockFormat: 'HH:mm', clockShowDate: true },
    { id: 'tpl-p-4', col: 1, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Screenshot', icon: '📸', color: '#475569', action: { type: 'hotkey', combo: 'Print' } },
    { id: 'tpl-p-5', col: 2, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Lock Screen', icon: '🔒', color: '#1e293b', action: { type: 'hotkey', combo: 'super+l' } },
    { id: 'tpl-p-6', col: 3, row: 2, colSpan: 1, rowSpan: 1, componentType: 'button', label: 'Snip Tool', icon: '✂', color: '#7c3aed', action: { type: 'hotkey', combo: 'shift+Print' } },
  ],
}

export const TEMPLATES: LayoutTemplate[] = [
  {
    id:          'gaming',
    name:        'Gaming',
    description: 'OBS recording, Discord mute, game hotkeys F1–F5, system volume slider',
    icon:        '🎮',
    page:        gamingPage,
  },
  {
    id:          'music',
    name:        'Music',
    description: 'Playback controls, shuffle, repeat, Spotify widget, and volume',
    icon:        '🎵',
    page:        musicPage,
  },
  {
    id:          'obs',
    name:        'OBS Studio',
    description: '3 scene switchers, recording toggle, streaming toggle, source mute',
    icon:        '📹',
    page:        obsPage,
  },
  {
    id:          'development',
    name:        'Development',
    description: 'Terminal, git commit / push / pull, build and test triggers',
    icon:        '👨‍💻',
    page:        devPage,
  },
  {
    id:          'home-assistant',
    name:        'Home Assistant',
    description: 'Webhook buttons for lights, scene triggers, and alarm control',
    icon:        '🏠',
    page:        haPage,
  },
  {
    id:          'productivity',
    name:        'Productivity',
    description: 'Pomodoro timer, stopwatch, clock, screenshot, and lock screen',
    icon:        '⚡',
    page:        productivityPage,
  },
]


// ── Add template to config ────────────────────────────────────────────────────

export function addTemplateToConfig(template: LayoutTemplate): void {
  if (!state.config) return

  const suffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const clonedComponents: Component[] = template.page.components.map(comp => ({
    ...comp,
    id: `tpl-${suffix()}`,
  }))

  const newPage: Page = {
    id:         `tpl-${suffix()}`,
    name:       template.page.name,
    cols:       template.page.cols,
    components: clonedComponents,
  }

  state.config.pages.push(newPage)
  pushConfig()
  renderAll()
}
