import { state, dom } from './state.js'
import { render }     from './render.js'
import { goBack }     from './components/folder.js'

const appEl = document.querySelector('.app')

appEl.addEventListener('touchstart', e => {
  if (!state.config) return
  const t            = e.touches[0]
  state.swipeStartX    = t.clientX
  state.swipeStartY    = t.clientY
  state.swipeStartTime = Date.now()
  state.swipeTracking  = !e.target.closest('.slider-cell, .knob-cell')
  state.swipeActive    = false
}, { passive: true })

appEl.addEventListener('touchmove', e => {
  if (!state.swipeTracking || !state.config) return
  const dx = e.touches[0].clientX - state.swipeStartX
  const dy = e.touches[0].clientY - state.swipeStartY

  if (!state.swipeActive) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (Math.abs(dy) > Math.abs(dx) * 0.85) { state.swipeTracking = false; return }
    state.swipeActive = true
  }

  e.preventDefault()

  const atStart = state.currentPageIdx === 0 && state.navStack.length === 0
  const atEnd   = state.currentPageIdx === state.currentPages.length - 1
  const tx = (dx > 0 && atStart) || (dx < 0 && atEnd) ? dx * 0.22 : dx
  dom.grid.style.transition = 'none'
  dom.grid.style.transform  = `translateX(${tx}px)`
}, { passive: false })

appEl.addEventListener('touchend', e => {
  if (!state.swipeActive) { state.swipeTracking = false; return }
  state.swipeTracking = false
  state.swipeActive   = false

  const dx       = e.changedTouches[0].clientX - state.swipeStartX
  const dt       = Math.max(1, Date.now() - state.swipeStartTime)
  const velocity = dx / dt

  const canGoNext = state.currentPageIdx < state.currentPages.length - 1
  const canGoPrev = state.currentPageIdx > 0 || state.navStack.length > 0
  const goNext    = dx < 0 && (Math.abs(velocity) > 0.35 || Math.abs(dx) > 55) && canGoNext
  const goPrev    = dx > 0 && (Math.abs(velocity) > 0.35 || Math.abs(dx) > 55) && canGoPrev

  if (goNext) {
    Haptic.ratchet()
    dom.grid.style.transition = 'transform 0.16s ease-in'
    dom.grid.style.transform  = 'translateX(-110%)'
    setTimeout(() => {
      dom.grid.style.transition = ''
      dom.grid.style.transform  = ''
      state.currentPageIdx++
      render()
    }, 160)
  } else if (goPrev) {
    Haptic.ratchet()
    dom.grid.style.transition = 'transform 0.16s ease-in'
    dom.grid.style.transform  = 'translateX(110%)'
    setTimeout(() => {
      dom.grid.style.transition = ''
      dom.grid.style.transform  = ''
      if (state.currentPageIdx > 0) { state.currentPageIdx--; render() }
      else { goBack() }
    }, 160)
  } else {
    dom.grid.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    dom.grid.style.transform  = ''
    setTimeout(() => { dom.grid.style.transition = '' }, 280)
  }
}, { passive: true })

appEl.addEventListener('touchcancel', () => {
  if (state.swipeActive) {
    dom.grid.style.transition = 'transform 0.22s ease'
    dom.grid.style.transform  = ''
    setTimeout(() => { dom.grid.style.transition = '' }, 220)
  }
  state.swipeTracking = false
  state.swipeActive   = false
}, { passive: true })
