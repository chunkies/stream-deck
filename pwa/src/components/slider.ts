import { applyBg, valueToPct } from '../applyBg.js'
import { send }                from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

export function createSlider(comp: Component, page: Page): HTMLElement {
  const horiz = comp.orientation === 'horizontal'
  const cell  = document.createElement('div')
  cell.className = 'slider-cell' + (horiz ? ' horizontal' : '')
  cell.dataset['key'] = `${page.id}:${comp.id}`
  applyBg(cell, comp.color, comp.image)

  const min  = comp.min          ?? 0
  const max  = comp.max          ?? 100
  const step = comp.step         ?? 1
  let value  = comp.defaultValue ?? 50
  const pct  = valueToPct(value, min, max)

  if (horiz) {
    cell.innerHTML = `<div class="slider-label"></div><div class="slider-track"><div class="slider-fill" style="width:${pct}%"></div><div class="slider-thumb" style="left:calc(${pct}% - 10px)"></div></div><div class="slider-value">${value}</div>`
  } else {
    cell.innerHTML = `<div class="slider-label"></div><div class="slider-track"><div class="slider-fill" style="height:${pct}%"></div><div class="slider-thumb" style="bottom:calc(${pct}% - 10px)"></div></div><div class="slider-value">${value}</div>`
  }
  cell.querySelector('.slider-label')!.textContent = comp.label ?? ''

  const track   = cell.querySelector<HTMLElement>('.slider-track')!
  const fill    = cell.querySelector<HTMLElement>('.slider-fill')!
  const thumb   = cell.querySelector<HTMLElement>('.slider-thumb')!
  const valueEl = cell.querySelector<HTMLElement>('.slider-value')!
  let dragging  = false

  function update(touch: Touch, ratchet = false): void {
    const rect   = track.getBoundingClientRect()
    const p      = horiz
      ? Math.max(0, Math.min(1, (touch.clientX - rect.left)  / rect.width))
      : Math.max(0, Math.min(1, (rect.bottom - touch.clientY) / rect.height))
    const newVal = Math.max(min, Math.min(max, Math.round((min + p * (max - min)) / step) * step))
    if (ratchet && newVal !== value) Haptic.ratchet()
    value = newVal
    const pv = valueToPct(value, min, max)
    if (horiz) { fill.style.width = `${pv}%`; thumb.style.left = `calc(${pv}% - 10px)` }
    else        { fill.style.height = `${pv}%`; thumb.style.bottom = `calc(${pv}% - 10px)` }
    valueEl.textContent = String(value)
  }

  if (comp.infiniteScroll) {
    let lastSentValue = comp.defaultValue ?? 50

    function getTrackValue(touch: Touch): number {
      const rect = track.getBoundingClientRect()
      const p = horiz
        ? Math.max(0, Math.min(1, (touch.clientX - rect.left)  / rect.width))
        : Math.max(0, Math.min(1, (rect.bottom - touch.clientY) / rect.height))
      return Math.max(min, Math.min(max, Math.round((min + p * (max - min)) / step) * step))
    }

    function applyPct(pv: number): void {
      if (horiz) { fill.style.width = `${pv}%`; thumb.style.left = `calc(${pv}% - 10px)` }
      else        { fill.style.height = `${pv}%`; thumb.style.bottom = `calc(${pv}% - 10px)` }
    }

    track.addEventListener('touchstart', (e: TouchEvent) => {
      dragging = true; cell.classList.add('dragging')
      const v = getTrackValue(e.touches[0])
      applyPct(valueToPct(v, min, max)); valueEl.textContent = String(v)
      e.preventDefault()
    }, { passive: false })

    track.addEventListener('touchmove', (e: TouchEvent) => {
      if (!dragging) return
      const v = getTrackValue(e.touches[0])
      applyPct(valueToPct(v, min, max)); valueEl.textContent = String(v)
      if (v !== lastSentValue) {
        Haptic.ratchet()
        send({ type: 'slide', pageId: page.id, compId: comp.id, value: v })
        lastSentValue = v
      }
      e.preventDefault()
    }, { passive: false })

    track.addEventListener('touchend', () => {
      if (!dragging) return
      dragging = false; cell.classList.remove('dragging')
      const center    = comp.defaultValue ?? 50
      const centerPct = valueToPct(center, min, max)
      applyPct(centerPct); valueEl.textContent = '·'
      send({ type: 'slide', pageId: page.id, compId: comp.id, value: center })
      lastSentValue = center
    })

  } else {
    track.addEventListener('touchstart', (e: TouchEvent) => { dragging = true; cell.classList.add('dragging'); update(e.touches[0]); e.preventDefault() }, { passive: false })
    track.addEventListener('touchmove',  (e: TouchEvent) => { if (dragging) { update(e.touches[0], true); e.preventDefault() } }, { passive: false })
    track.addEventListener('touchend',   (e: TouchEvent) => {
      if (!dragging) return
      dragging = false; cell.classList.remove('dragging')
      update(e.changedTouches[0])
      send({ type: 'slide', pageId: page.id, compId: comp.id, value })
    })
  }

  return cell
}
