import { applyBg, valueToPct } from '../applyBg.js'
import { send }                from '../ws.js'
import type { Component, Page } from '../../../electron/shared/types.js'

const KNOB_CX        = 36
const KNOB_CY        = 36
const KNOB_R         = 27
const KNOB_START_DEG = -135
const KNOB_RANGE_DEG = 270

function polarToXY(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg)
  const e = polarToXY(cx, cy, r, endDeg)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function knobSVG(pct: number): string {
  const cx = KNOB_CX, cy = KNOB_CY, r = KNOB_R
  const start = KNOB_START_DEG, range = KNOB_RANGE_DEG
  const currentDeg = start + pct * range
  const trackArc = describeArc(cx, cy, r, start, start + range)
  const fillArc  = pct > 0.001 ? describeArc(cx, cy, r, start, currentDeg) : null
  const tick     = polarToXY(cx, cy, r - 3, currentDeg)
  return `<svg viewBox="0 0 72 72" width="100%" height="100%">
    <defs>
      <linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#a78bfa"/>
      </linearGradient>
    </defs>
    <path d="${trackArc}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4" stroke-linecap="round"/>
    ${fillArc ? `<path d="${fillArc}" fill="none" stroke="url(#kg)" stroke-width="4" stroke-linecap="round"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="18" fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
    <circle cx="${tick.x.toFixed(2)}" cy="${tick.y.toFixed(2)}" r="2.5" fill="${pct > 0.001 ? '#a78bfa' : 'rgba(255,255,255,0.25)'}"/>
  </svg>`
}

export function createKnob(comp: Component, page: Page): HTMLElement {
  const cell = document.createElement('div')
  cell.className = 'knob-cell'
  applyBg(cell, comp.color, comp.image)

  const min  = comp.min ?? 0
  const max  = comp.max ?? 100
  const step = comp.step ?? 1
  let value  = comp.defaultValue ?? Math.round((min + max) / 2)
  let pct    = valueToPct(value, min, max) / 100

  cell.innerHTML = `<div class="knob-label"></div><div class="knob-ring">${knobSVG(pct)}</div><div class="knob-value">${value}</div>`
  cell.querySelector('.knob-label')!.textContent = comp.label ?? ''

  const ringEl  = cell.querySelector('.knob-ring')!
  const valueEl = cell.querySelector<HTMLElement>('.knob-value')!

  let startY = 0, startVal = value, dragging = false, lastSentValue = value

  cell.addEventListener('pointerdown', (e: PointerEvent) => {
    startY = e.clientY; startVal = value; lastSentValue = value
    dragging = true; cell.classList.add('dragging'); cell.setPointerCapture(e.pointerId)
    e.preventDefault()
  })

  cell.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return
    const dy     = startY - e.clientY
    const raw    = startVal + (dy / 140) * (max - min)
    const newVal = Math.max(min, Math.min(max, Math.round(raw / step) * step))
    if (newVal !== value) {
      value = newVal
      if (value !== lastSentValue) Haptic.ratchet()
      pct              = valueToPct(value, min, max) / 100
      ringEl.innerHTML = knobSVG(pct)
      valueEl.textContent = String(value)
      if (comp.infiniteScroll && value !== lastSentValue) {
        send({ type: 'slide', pageId: page.id, compId: comp.id, value })
        lastSentValue = value
      }
    }
  })

  cell.addEventListener('pointerup', () => {
    if (!dragging) return
    dragging = false; cell.classList.remove('dragging')
    if (comp.infiniteScroll) {
      const center = comp.defaultValue ?? Math.round((min + max) / 2)
      value = center; pct = valueToPct(center, min, max) / 100
      ringEl.innerHTML = knobSVG(pct); valueEl.textContent = '·'
      send({ type: 'slide', pageId: page.id, compId: comp.id, value: center })
      lastSentValue = center
    } else {
      lastSentValue = value
      send({ type: 'slide', pageId: page.id, compId: comp.id, value })
    }
  })

  cell.addEventListener('pointercancel', () => { dragging = false; cell.classList.remove('dragging') })

  return cell
}
