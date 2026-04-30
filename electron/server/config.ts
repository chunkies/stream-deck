import fs   from 'fs'
import path from 'path'

import { COMPONENT_TYPES } from './constants'
import type { Config, Component } from '../shared/types'

// ── Default config ─────────────────────────────────────
export const DEFAULT_CONFIG: Config = {
  grid: { cols: 3, rows: 4 },
  pages: [
    {
      id: 'media',
      name: 'Media',
      components: [
        { id: 'c-prev', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏮', label: 'Prev',       color: '#1e293b', action: { type: 'builtin', key: 'media.previous'  } },
        { id: 'c-play', col: 2, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏯', label: 'Play/Pause', color: '#1e293b', action: { type: 'builtin', key: 'media.playPause' } },
        { id: 'c-next', col: 3, row: 1, colSpan: 1, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '⏭', label: 'Next',       color: '#1e293b', action: { type: 'builtin', key: 'media.next'      } },
        { id: 'c-vol',  col: 1, row: 2, colSpan: 1, rowSpan: 2, componentType: COMPONENT_TYPES.SLIDER, label: 'Volume', color: '#1e293b', min: 0, max: 100, step: 5, defaultValue: 50, action: { type: 'command', command: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ {value}%' } },
        { id: 'c-mute', col: 2, row: 2, colSpan: 2, rowSpan: 1, componentType: COMPONENT_TYPES.SWITCH, label: 'Mute', color: '#1e293b', action: { type: 'toggle', on: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 1', off: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ 0' } },
        { id: 'c-spty', col: 2, row: 3, colSpan: 2, rowSpan: 1, componentType: COMPONENT_TYPES.BUTTON, icon: '🎵', label: 'Spotify',   color: '#14532d', action: { type: 'command', command: 'spotify'      } },
        { id: 'c-tile', col: 1, row: 4, colSpan: 3, rowSpan: 1, componentType: COMPONENT_TYPES.TILE,   label: 'Now Playing', color: '#0f172a', pollCommand: 'playerctl metadata title 2>/dev/null || echo "Nothing"', pollInterval: 3 }
      ]
    }
  ]
}

export function migrateConfig(cfg: Config): Config {
  const defaultCols = cfg.grid?.cols || 3
  for (const page of (cfg.pages || [])) {
    if (!page.components) {
      const cols = page.cols || defaultCols
      const components: Component[] = []
      ;(page.slots || []).forEach((slot, i) => {
        if (!slot) return
        components.push({
          id: `cm${i}-${page.id}`,
          col: (i % cols) + 1,
          row: Math.floor(i / cols) + 1,
          colSpan: 1, rowSpan: 1,
          ...(slot as Partial<Component>)
        } as Component)
      })
      page.components = components
      delete page.slots
    }
    for (const comp of page.components) {
      if (comp.componentType === 'toggle') comp.componentType = COMPONENT_TYPES.SWITCH
    }
  }
  return cfg
}

export function validateConfig(cfg: unknown): cfg is Config {
  return Boolean(
    cfg !== null &&
    typeof cfg === 'object' &&
    (cfg as Config).grid &&
    typeof (cfg as Config).grid.cols === 'number' &&
    typeof (cfg as Config).grid.rows === 'number' &&
    Array.isArray((cfg as Config).pages)
  )
}

export function loadConfig(filePath: string): Config {
  try {
    if (fs.existsSync(filePath)) return migrateConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')) as Config)
  } catch {}
  saveConfig(filePath, DEFAULT_CONFIG)
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config
}

export function saveConfig(filePath: string, cfg: Config): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2))
}
