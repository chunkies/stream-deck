import type { Config, Action } from '../shared/types'

// ── State ──────────────────────────────────────────────
const counterStates:   Record<string, number>  = {}
const stopwatchStates: Record<string, { running: boolean; startedAt: number; elapsed: number }> = {}
const countdownStates: Record<string, { running: boolean; startedAt: number; remaining: number; duration: number }> = {}

let clockInterval:     ReturnType<typeof setInterval> | null = null
let stopwatchInterval: ReturnType<typeof setInterval> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

type BroadcastFn = (msg: Record<string, unknown>) => void

// ── Formatting helpers (exported for tests) ────────────

export function formatDuration(ms: number, showMs = false): string {
  const totalSec = Math.floor(ms / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  if (!showMs) return base
  return `${base}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`
}

export function formatTime(date: Date, fmt: string, tz?: string): string {
  let d = date
  if (tz) {
    try {
      const str = date.toLocaleString('en-CA', {
        timeZone: tz,
        hour12: false,
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        year:   'numeric',
        month:  '2-digit',
        day:    '2-digit',
      })
      d = new Date(str)
    } catch { /* invalid timezone, use local */ }
  }
  const H  = d.getHours()
  const h  = H % 12 || 12
  const mm = d.getMinutes()
  const ss = d.getSeconds()
  const A  = H < 12 ? 'AM' : 'PM'
  return fmt
    .replace('HH', String(H).padStart(2, '0'))
    .replace('hh', String(h).padStart(2, '0'))
    .replace('mm', String(mm).padStart(2, '0'))
    .replace('ss', String(ss).padStart(2, '0'))
    .replace('A',  A)
}

export function formatDate(date: Date, fmt: string): string {
  const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return fmt
    .replace('ddd',  days[date.getDay()])
    .replace('D',    String(date.getDate()))
    .replace('MMM',  months[date.getMonth()])
    .replace('YYYY', String(date.getFullYear()))
}

// ── Counter ────────────────────────────────────────────

export function handleCounterPress(
  pageId: string,
  compId: string,
  hold: boolean,
  doubletap: boolean,
  comp: { counterMin?: number; counterMax?: number | null; counterStep?: number },
  broadcast: BroadcastFn,
): void {
  const key  = `${pageId}:${compId}`
  const min  = comp.counterMin  ?? 0
  const max  = comp.counterMax  ?? null
  const step = comp.counterStep ?? 1

  let val = counterStates[key] ?? min
  if (doubletap)    val = min
  else if (hold)    val = Math.max(min, val - step)
  else              val = max !== null ? Math.min(max, val + step) : val + step

  counterStates[key] = val
  broadcast({ type: 'tileUpdate', key, text: String(val) })
}

// ── Stopwatch ──────────────────────────────────────────

export function handleStopwatchPress(
  pageId: string,
  compId: string,
  hold: boolean,
  comp: { stopwatchShowMs?: boolean },
  broadcast: BroadcastFn,
): void {
  const key = `${pageId}:${compId}`
  const st  = stopwatchStates[key] ?? { running: false, startedAt: 0, elapsed: 0 }

  if (hold) {
    stopwatchStates[key] = { running: false, startedAt: 0, elapsed: 0 }
    broadcast({ type: 'tileUpdate', key, text: formatDuration(0, comp.stopwatchShowMs) })
    return
  }

  if (st.running) {
    st.elapsed  += Date.now() - st.startedAt
    st.running   = false
    st.startedAt = 0
  } else {
    st.startedAt = Date.now()
    st.running   = true
  }
  stopwatchStates[key] = st
}

// ── Countdown ──────────────────────────────────────────

export function handleCountdownPress(
  pageId: string,
  compId: string,
  hold: boolean,
  comp: { duration?: number },
  broadcast: BroadcastFn,
): void {
  const key      = `${pageId}:${compId}`
  const duration = (comp.duration ?? 60) * 1000
  const st       = countdownStates[key] ?? { running: false, startedAt: 0, remaining: duration, duration }

  if (hold) {
    countdownStates[key] = { running: false, startedAt: 0, remaining: duration, duration }
    broadcast({ type: 'tileUpdate', key, text: formatDuration(duration) })
    return
  }

  if (st.running) {
    st.remaining -= Date.now() - st.startedAt
    st.running    = false
    st.startedAt  = 0
    if (st.remaining < 0) st.remaining = 0
  } else if (st.remaining > 0) {
    st.startedAt = Date.now()
    st.running   = true
  }
  countdownStates[key] = st
}

// ── Start / stop all timers ────────────────────────────

export function startTimers(
  config: Config,
  broadcast: BroadcastFn,
  runAction: (action: Action, pageId: string, compId: string) => void,
): void {
  if (clockInterval)     clearInterval(clockInterval)
  if (stopwatchInterval) clearInterval(stopwatchInterval)
  if (countdownInterval) clearInterval(countdownInterval)

  function allComps() {
    return config.pages.flatMap(p => (p.components ?? []).map(c => ({ page: p, comp: c })))
  }

  // Clock — broadcast every second
  const clocks = allComps().filter(({ comp }) => comp.componentType === 'clock')
  if (clocks.length) {
    clockInterval = setInterval(() => {
      const now = new Date()
      for (const { page, comp } of allComps()) {
        if (comp.componentType !== 'clock') continue
        const key  = `${page.id}:${comp.id}`
        const fmt  = comp.clockFormat ?? 'HH:mm'
        let text   = formatTime(now, fmt, comp.clockTimezone)
        if (comp.clockShowDate) text += '\n' + formatDate(now, comp.clockDateFormat ?? 'ddd D MMM')
        broadcast({ type: 'tileUpdate', key, text })
      }
    }, 1000)
  }

  // Stopwatch — broadcast every 100ms when any running
  stopwatchInterval = setInterval(() => {
    for (const { page, comp } of allComps()) {
      if (comp.componentType !== 'stopwatch') continue
      const key = `${page.id}:${comp.id}`
      const st  = stopwatchStates[key]
      if (!st?.running) continue
      const elapsed = st.elapsed + (Date.now() - st.startedAt)
      broadcast({ type: 'tileUpdate', key, text: formatDuration(elapsed, comp.stopwatchShowMs) })
    }
  }, 100)

  // Countdown — broadcast every second, fire action on complete
  countdownInterval = setInterval(() => {
    for (const { page, comp } of allComps()) {
      if (comp.componentType !== 'countdown') continue
      const key = `${page.id}:${comp.id}`
      const st  = countdownStates[key]
      if (!st?.running) continue
      const remaining = Math.max(0, st.remaining - (Date.now() - st.startedAt))
      broadcast({ type: 'tileUpdate', key, text: formatDuration(remaining) })
      if (remaining <= 0) {
        st.running   = false
        st.remaining = 0
        countdownStates[key] = st
        if (comp.onComplete) runAction(comp.onComplete, page.id, comp.id)
      }
    }
  }, 1000)

  // Initialize counter display values
  for (const { page, comp } of allComps()) {
    if (comp.componentType !== 'counter') continue
    const key = `${page.id}:${comp.id}`
    if (counterStates[key] === undefined) counterStates[key] = comp.counterMin ?? 0
    broadcast({ type: 'tileUpdate', key, text: String(counterStates[key]) })
  }
}

export function stopTimers(): void {
  if (clockInterval)     { clearInterval(clockInterval);     clockInterval     = null }
  if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null }
}
