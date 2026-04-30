import { state, dom } from './state.js'
import { render }     from './render.js'
import { goBack }     from './components/folder.js'

const SWIPE_DEADZONE_PX        = 6
const SWIPE_ANGLE_RATIO        = 0.85
const SWIPE_ELASTIC_FACTOR     = 0.22
const SWIPE_VELOCITY_THRESHOLD = 0.35
const SWIPE_DISTANCE_THRESHOLD = 55
const SWIPE_ANIMATION_MS       = 160
const BOUNCE_ANIMATION_MS      = 280
const CANCEL_ANIMATION_MS      = 220

const appEl = document.querySelector<HTMLElement>('.app')!

appEl.addEventListener('touchstart', (e: TouchEvent) => {
  if (!state.config) return
  const t              = e.touches[0]
  state.swipeStartX    = t.clientX
  state.swipeStartY    = t.clientY
  state.swipeStartTime = Date.now()
  state.swipeTracking  = !(e.target as HTMLElement).closest('.slider-cell, .knob-cell')
  state.swipeActive    = false
}, { passive: true })

appEl.addEventListener('touchmove', (e: TouchEvent) => {
  if (!state.swipeTracking || !state.config) return
  const dx = e.touches[0].clientX - state.swipeStartX
  const dy = e.touches[0].clientY - state.swipeStartY

  if (!state.swipeActive) {
    if (Math.abs(dx) < SWIPE_DEADZONE_PX && Math.abs(dy) < SWIPE_DEADZONE_PX) return
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_ANGLE_RATIO) { state.swipeTracking = false; return }
    state.swipeActive = true
  }

  e.preventDefault()

  const atStart = state.currentPageIdx === 0 && state.navStack.length === 0
  const atEnd   = state.currentPageIdx === state.currentPages!.length - 1
  const tx = (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * SWIPE_ELASTIC_FACTOR : dx
  dom.grid.style.transition = 'none'
  dom.grid.style.transform  = `translateX(${tx}px)`
}, { passive: false })

appEl.addEventListener('touchend', (e: TouchEvent) => {
  if (!state.swipeActive) { state.swipeTracking = false; return }
  state.swipeTracking = false
  state.swipeActive   = false

  const dx       = e.changedTouches[0].clientX - state.swipeStartX
  const dt       = Math.max(1, Date.now() - state.swipeStartTime)
  const velocity = dx / dt

  const canGoNext = state.currentPageIdx < state.currentPages!.length - 1
  const canGoPrev = state.currentPageIdx > 0 || state.navStack.length > 0
  const goNext = dx < 0 && (Math.abs(velocity) > SWIPE_VELOCITY_THRESHOLD || Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD) && canGoNext
  const goPrev = dx > 0 && (Math.abs(velocity) > SWIPE_VELOCITY_THRESHOLD || Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD) && canGoPrev

  if (goNext) {
    Haptic.ratchet()
    dom.grid.style.transition = `transform ${SWIPE_ANIMATION_MS}ms ease-in`
    dom.grid.style.transform  = 'translateX(-110%)'
    setTimeout(() => {
      dom.grid.style.transition = ''
      dom.grid.style.transform  = ''
      state.currentPageIdx++
      render()
    }, SWIPE_ANIMATION_MS)
  } else if (goPrev) {
    Haptic.ratchet()
    dom.grid.style.transition = `transform ${SWIPE_ANIMATION_MS}ms ease-in`
    dom.grid.style.transform  = 'translateX(110%)'
    setTimeout(() => {
      dom.grid.style.transition = ''
      dom.grid.style.transform  = ''
      if (state.currentPageIdx > 0) { state.currentPageIdx--; render() }
      else { goBack() }
    }, SWIPE_ANIMATION_MS)
  } else {
    dom.grid.style.transition = `transform ${BOUNCE_ANIMATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
    dom.grid.style.transform  = ''
    setTimeout(() => { dom.grid.style.transition = '' }, BOUNCE_ANIMATION_MS)
  }
}, { passive: true })

appEl.addEventListener('touchcancel', () => {
  if (state.swipeActive) {
    dom.grid.style.transition = `transform ${CANCEL_ANIMATION_MS}ms ease`
    dom.grid.style.transform  = ''
    setTimeout(() => { dom.grid.style.transition = '' }, CANCEL_ANIMATION_MS)
  }
  state.swipeTracking = false
  state.swipeActive   = false
}, { passive: true })
