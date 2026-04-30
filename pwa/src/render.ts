// Note: circular import with folder.js (folder → render → folder) is intentional —
// render is only called inside function bodies, never at module init.
import { state, dom }              from './state.js'
import { createButton }            from './components/button.js'
import { createSwitch }            from './components/switch.js'
import { createKnob }              from './components/knob.js'
import { createTile }              from './components/tile.js'
import { createPluginTile }        from './components/plugin-tile.js'
import { createSpotifyTile }       from './components/spotify.js'
import { createVoiceButton }       from './components/voice.js'
import { createSlider }            from './components/slider.js'
import { createFolder }            from './components/folder.js'
import { createCounter }           from './components/counter.js'
import { createClock }             from './components/clock.js'
import { createStopwatch }         from './components/stopwatch.js'
import { createCountdown }         from './components/countdown.js'
import { createTrackpad }          from './components/trackpad.js'
import type { Component, Page }    from '../../electron/shared/types.js'

export function render(): void { if (!state.config) return; renderGrid(); renderDots() }

export function renderGrid(): void {
  const page = state.currentPages![state.currentPageIdx]
  const cols = page.cols ?? state.config!.grid.cols
  const rows = state.config!.grid.rows

  dom.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  dom.grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  dom.grid.innerHTML = ''
  dom.pageNameEl.textContent = page.name
  dom.grid.classList.remove('page-in')
  void dom.grid.offsetWidth
  dom.grid.classList.add('page-in')

  for (const comp of (page.components ?? [])) {
    const el = buildComponent(comp, page)
    el.style.gridColumn = `${comp.col} / span ${comp.colSpan ?? 1}`
    el.style.gridRow    = `${comp.row} / span ${comp.rowSpan ?? 1}`
    dom.grid.appendChild(el)
  }
}

function buildComponent(comp: Component, page: Page): HTMLElement {
  switch (comp.componentType) {
    case 'slider':      return createSlider(comp, page)
    case 'switch':
    case 'toggle':      return createSwitch(comp, page)
    case 'knob':        return createKnob(comp, page)
    case 'tile':        return createTile(comp, page)
    case 'spotify':     return createSpotifyTile(comp, page)
    case 'voice':       return createVoiceButton(comp, page)
    case 'plugin-tile': return createPluginTile(comp, page)
    case 'folder':      return createFolder(comp, page)
    case 'counter':     return createCounter(comp, page)
    case 'clock':       return createClock(comp, page)
    case 'stopwatch':   return createStopwatch(comp, page)
    case 'countdown':   return createCountdown(comp, page)
    case 'trackpad':    return createTrackpad(comp, page)
    default:            return createButton(comp, page)
  }
}

export function renderDots(): void {
  dom.pageDots.innerHTML = ''
  state.currentPages!.forEach((_, i) => {
    const dot = document.createElement('div')
    dot.className = 'page-dot' + (i === state.currentPageIdx ? ' active' : '')
    dot.addEventListener('click', () => { state.currentPageIdx = i; render() })
    dom.pageDots.appendChild(dot)
  })
  document.getElementById('back-btn')?.classList.toggle('hidden', state.navStack.length === 0)
}
