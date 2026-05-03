import type { Config, CronTrigger } from '../shared/types'

// ── Cron expression matcher ────────────────────────────

/**
 * Match a single cron field value against the current time value.
 * Supports: '*' (wildcard), '* /n' (step), and exact numeric values.
 */
export function matchField(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    if (isNaN(step) || step <= 0) return false
    return value % step === 0
  }
  const num = parseInt(field, 10)
  return !isNaN(num) && num === value
}

/**
 * Check if a 5-field cron expression matches the given Date.
 * Fields: minute hour day month weekday
 */
export function matchesCron(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [minF, hourF, domF, monF, dowF] = fields
  return (
    matchField(minF,  date.getMinutes())    &&
    matchField(hourF, date.getHours())      &&
    matchField(domF,  date.getDate())       &&
    matchField(monF,  date.getMonth() + 1) &&
    matchField(dowF,  date.getDay())
  )
}

// ── Engine state ───────────────────────────────────────

let cronInterval: ReturnType<typeof setInterval> | null = null

// ── Public API ─────────────────────────────────────────

export function startCrons(
  getConfig: () => Config,
  runAction: (pageId: string, compId: string) => void,
): void {
  if (cronInterval) clearInterval(cronInterval)

  cronInterval = setInterval(() => {
    const config  = getConfig()
    const triggers: CronTrigger[] = config.crons ?? []
    const now     = new Date()

    for (const trigger of triggers) {
      if (!trigger.enabled) continue
      if (matchesCron(trigger.cron, now)) {
        runAction(trigger.pageId, trigger.compId)
      }
    }
  }, 60_000)
}

export function stopCrons(): void {
  if (cronInterval) {
    clearInterval(cronInterval)
    cronInterval = null
  }
}
