import { state }  from '../state.js'
import { applyBg } from '../applyBg.js'
import { render }  from '../render.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function goBack(): void {
  if (!state.navStack.length) return
  const prev = state.navStack.pop()!
  state.currentPages   = prev.pages
  state.currentPageIdx = prev.pageIdx
  render()
}

export function createFolder(comp: Component, _page: Page): HTMLElement {
  const btn = document.createElement('div')
  btn.className = 'btn folder-btn'
  applyBg(btn, comp.color, comp.image)
  const pageCount = (comp.pages ?? []).length
  btn.innerHTML = `<div class="btn-icon"></div><div class="btn-label"></div>${pageCount > 0 ? '<div class="folder-badge"></div>' : ''}`
  btn.querySelector('.btn-icon')!.textContent  = comp.icon ?? '📁'
  btn.querySelector('.btn-label')!.textContent = comp.label ?? 'Folder'
  if (pageCount > 0) btn.querySelector('.folder-badge')!.textContent = String(pageCount)

  btn.addEventListener('pointerdown', () => {
    if (!comp.pages?.length) return
    Haptic.tap()
    btn.classList.add('pressed')
    setTimeout(() => btn.classList.remove('pressed'), 150)
    setTimeout(() => {
      state.navStack.push({ pages: state.currentPages!, pageIdx: state.currentPageIdx })
      state.currentPages   = comp.pages!
      state.currentPageIdx = 0
      render()
    }, 80)
  })

  return btn
}
