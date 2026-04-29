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

export function render() { if (!state.config) return; renderGrid(); renderDots() }

export function renderGrid() {
  const page = state.currentPages[state.currentPageIdx]
  const cols = page.cols || state.config.grid.cols
  const rows = state.config.grid.rows

  dom.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
  dom.grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`
  dom.grid.innerHTML = ''
  dom.pageNameEl.textContent = page.name
  dom.grid.classList.remove('page-in')
  void dom.grid.offsetWidth
  dom.grid.classList.add('page-in')

  for (const comp of (page.components || [])) {
    let el
    switch (comp.componentType) {
      case 'slider':      el = createSlider(comp, page);      break
      case 'switch':
      case 'toggle':      el = createSwitch(comp, page);      break
      case 'knob':        el = createKnob(comp, page);        break
      case 'tile':        el = createTile(comp, page);        break
      case 'spotify':     el = createSpotifyTile(comp, page); break
      case 'voice':       el = createVoiceButton(comp, page); break
      case 'plugin-tile': el = createPluginTile(comp, page);  break
      case 'folder':      el = createFolder(comp, page);      break
      default:            el = createButton(comp, page);      break
    }
    el.style.gridColumn = `${comp.col} / span ${comp.colSpan || 1}`
    el.style.gridRow    = `${comp.row} / span ${comp.rowSpan || 1}`
    dom.grid.appendChild(el)
  }
}

export function renderDots() {
  dom.pageDots.innerHTML = ''
  state.currentPages.forEach((_, i) => {
    const dot = document.createElement('div')
    dot.className = 'page-dot' + (i === state.currentPageIdx ? ' active' : '')
    dot.addEventListener('click', () => { state.currentPageIdx = i; render() })
    dom.pageDots.appendChild(dot)
  })
  document.getElementById('back-btn')?.classList.toggle('hidden', state.navStack.length === 0)
}
