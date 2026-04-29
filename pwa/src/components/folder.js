import { state }  from '../state.js'
import { applyBg } from '../applyBg.js'
import { render }  from '../render.js'

export function goBack() {
  if (!state.navStack.length) return
  const prev = state.navStack.pop()
  state.currentPages   = prev.pages
  state.currentPageIdx = prev.pageIdx
  render()
}

export function createFolder(comp, page) {
  const btn = document.createElement('div')
  btn.className = 'btn folder-btn'
  applyBg(btn, comp.color, comp.image)
  const pageCount = (comp.pages || []).length
  btn.innerHTML = `
    <div class="btn-icon">${comp.icon || '📁'}</div>
    <div class="btn-label">${comp.label || 'Folder'}</div>
    ${pageCount > 0 ? `<div class="folder-badge">${pageCount}</div>` : ''}
  `
  btn.addEventListener('pointerdown', () => {
    if (!comp.pages?.length) return
    Haptic.tap()
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    setTimeout(() => {
      state.navStack.push({ pages: state.currentPages, pageIdx: state.currentPageIdx })
      state.currentPages   = comp.pages
      state.currentPageIdx = 0
      render()
    }, 80)
  })
  return btn
}
