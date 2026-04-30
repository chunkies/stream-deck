'use strict'

/**
 * Pomodoro plugin — work/break timer with cycle tracking.
 *
 * State machine:
 *   idle  — timer not running, ready to start
 *   work  — counting down a work interval
 *   break — counting down a break interval
 *
 * Every second the cron tick decrements `remaining` and broadcasts
 * a status update. When remaining hits 0 the plugin auto-switches
 * phases and fires a desktop notification.
 */
module.exports = (sdk) => {
  // --- persistent settings ---
  const DEFAULT_WORK_MS  = 25 * 60 * 1000
  const DEFAULT_BREAK_MS =  5 * 60 * 1000

  const storedWork  = sdk.storage.get('workMs')
  const storedBreak = sdk.storage.get('breakMs')

  // --- mutable state (in-memory only) ---
  let state      = 'idle'                                          // 'idle' | 'work' | 'break'
  let workMs     = typeof storedWork  === 'number' ? storedWork  : DEFAULT_WORK_MS
  let breakMs    = typeof storedBreak === 'number' ? storedBreak : DEFAULT_BREAK_MS
  let remaining  = workMs                                          // ms left in current phase
  let cycleCount = 0                                               // completed pomodoros
  let running    = false                                           // whether the clock is ticking

  // --- helpers ---

  /** Format milliseconds as "MM:SS". */
  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  /** Broadcast the full timer status to all PWA clients. */
  function broadcastStatus() {
    sdk.broadcast('status', {
      state,
      remaining,
      remainingFormatted: formatRemaining(remaining),
      cycleCount
    })
  }

  /** Called when the work phase ends — switch to break. */
  function phaseWorkComplete() {
    cycleCount++
    state     = 'break'
    remaining = breakMs
    sdk.notify('Pomodoro', 'Work done! Starting break.')
    sdk.log.info(`Work phase complete. Cycle #${cycleCount}. Starting break (${formatRemaining(breakMs)}).`)
    broadcastStatus()
  }

  /** Called when the break phase ends — switch back to work. */
  function phaseBreakComplete() {
    state     = 'work'
    remaining = workMs
    sdk.notify('Pomodoro', 'Break over! Back to work.')
    sdk.log.info(`Break complete. Starting work phase (${formatRemaining(workMs)}).`)
    broadcastStatus()
  }

  // --- 1-second cron tick ---
  sdk.cron(1000, () => {
    if (!running) return

    remaining = Math.max(0, remaining - 1000)
    broadcastStatus()

    if (remaining <= 0) {
      if (state === 'work')  phaseWorkComplete()
      else if (state === 'break') phaseBreakComplete()
    }
  })

  // --- action handlers ---

  /**
   * pomodoro.start — toggle pause/resume.
   * If idle, initialise the work phase and start ticking.
   * If running, pause. If paused (state is work/break but !running), resume.
   */
  sdk.on('pomodoro.start', () => {
    if (state === 'idle') {
      state     = 'work'
      remaining = workMs
      running   = true
      sdk.log.info(`Pomodoro started. Work phase: ${formatRemaining(workMs)}`)
    } else if (running) {
      running = false
      sdk.log.info('Pomodoro paused.')
    } else {
      running = true
      sdk.log.info('Pomodoro resumed.')
    }
    broadcastStatus()
  })

  /**
   * pomodoro.reset — stop the timer and return to idle.
   */
  sdk.on('pomodoro.reset', () => {
    running    = false
    state      = 'idle'
    remaining  = workMs
    cycleCount = 0
    sdk.log.info('Pomodoro reset.')
    broadcastStatus()
  })

  /**
   * pomodoro.setWork — persist and apply a new work duration in minutes.
   * Resets the timer to idle so the new duration takes effect cleanly.
   */
  sdk.on('pomodoro.setWork', (params) => {
    const minutes = Number((params && params.minutes) != null ? params.minutes : 25)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      sdk.log.warn(`pomodoro.setWork: invalid minutes value "${params && params.minutes}"`)
      return
    }
    workMs = minutes * 60 * 1000
    sdk.storage.set('workMs', workMs)

    // Reset so the new duration is reflected immediately
    running   = false
    state     = 'idle'
    remaining = workMs
    sdk.log.info(`Work duration set to ${minutes} min.`)
    broadcastStatus()
  })

  /**
   * pomodoro.setBreak — persist and apply a new break duration in minutes.
   */
  sdk.on('pomodoro.setBreak', (params) => {
    const minutes = Number((params && params.minutes) != null ? params.minutes : 5)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      sdk.log.warn(`pomodoro.setBreak: invalid minutes value "${params && params.minutes}"`)
      return
    }
    breakMs = minutes * 60 * 1000
    sdk.storage.set('breakMs', breakMs)
    sdk.log.info(`Break duration set to ${minutes} min.`)
    broadcastStatus()
  })

  /**
   * pomodoro.getStatus — on-demand status broadcast.
   */
  sdk.on('pomodoro.getStatus', () => {
    broadcastStatus()
  })

  // Broadcast initial state so any connecting client can sync immediately
  broadcastStatus()
}
