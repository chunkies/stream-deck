import { execSync } from 'child_process'

import { PLATFORMS, COMPONENT_TYPES, MESSAGE_TYPES, TIMINGS } from './constants'
import { OS } from './keyboard'
import type { Config } from '../shared/types'

// ── Tile polling state ─────────────────────────────────
let tileTimers: Record<string, ReturnType<typeof setInterval>> = {}
export const tileCache: Record<string, string> = {}

export function startTilePollers(config: Config | null, broadcast: (msg: Record<string, unknown>) => void): void {
  stopTilePollers()
  if (!config) return
  config.pages.forEach(page => {
    ;(page.components || []).forEach(comp => {
      if (comp?.componentType !== COMPONENT_TYPES.TILE || !comp.pollCommand) return
      const SHELL_INJECT = /`|\$\(/
      if (SHELL_INJECT.test(comp.pollCommand)) {
        console.error(`Tile poll "${page.id}:${comp.id}" rejected: pollCommand contains command substitution`)
        return
      }
      const key      = `${page.id}:${comp.id}`
      const interval = Math.max(TIMINGS.TILE_POLL_MIN_MS, (comp.pollInterval ?? 5) * 1000)
      const cmd      = comp.pollCommand

      function poll(): void {
        try {
          const text = execSync(cmd, {
            shell: OS === PLATFORMS.WINDOWS ? 'cmd.exe' : '/bin/sh',
            timeout: TIMINGS.TILE_POLL_CMD_MS
          }).toString().trim().split('\n')[0]
          tileCache[key] = text
          broadcast({ type: MESSAGE_TYPES.TILE_UPDATE, key, text })
        } catch (err) {
          console.error(`Tile poll "${key}" failed:`, (err as Error).message)
        }
      }

      poll()
      tileTimers[key] = setInterval(poll, interval)
    })
  })
}

export function stopTilePollers(): void {
  Object.values(tileTimers).forEach(clearInterval)
  tileTimers = {}
}
