import type { CronTrigger } from '../../shared/types'
import { state } from './state'
import { pushConfig } from './config'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }
function inp(id: string): HTMLInputElement { return document.getElementById(id) as HTMLInputElement }
function sel(id: string): HTMLSelectElement { return document.getElementById(id) as HTMLSelectElement }

// ── Cron list rendering ────────────────────────────────

export function renderCronList(): void {
  const list   = el('cron-list')
  const crons: CronTrigger[] = state.config?.crons ?? []
  list.innerHTML = ''

  if (crons.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'field-hint'
    empty.style.fontSize = '11px'
    empty.textContent = 'No cron triggers.'
    list.appendChild(empty)
    return
  }

  for (const cron of crons) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px'

    const label = document.createElement('span')
    label.style.cssText = 'flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    label.textContent = `${cron.label || cron.cron} (${cron.enabled ? 'on' : 'off'})`

    const del = document.createElement('button')
    del.className = 'btn-secondary'
    del.style.cssText = 'padding:2px 6px;font-size:10px;flex-shrink:0'
    del.textContent = '✕'
    del.addEventListener('click', () => {
      if (!state.config) return
      state.config.crons = (state.config.crons ?? []).filter(c => c.id !== cron.id)
      pushConfig()
      renderCronList()
    })

    row.appendChild(label)
    row.appendChild(del)
    list.appendChild(row)
  }
}

// ── Populate page/comp selects ─────────────────────────

function populateCronPageSelect(): void {
  const pageSel = sel('cron-page')
  pageSel.innerHTML = ''
  const pages = state.config?.pages ?? []
  for (const page of pages) {
    const opt = document.createElement('option')
    opt.value = page.id
    opt.textContent = page.name
    pageSel.appendChild(opt)
  }
  populateCronCompSelect()
}

function populateCronCompSelect(): void {
  const pageSel = sel('cron-page')
  const compSel = sel('cron-comp')
  compSel.innerHTML = ''
  const pageId = pageSel.value
  const page   = state.config?.pages.find(p => p.id === pageId)
  if (!page) return
  for (const comp of page.components) {
    const opt = document.createElement('option')
    opt.value = comp.id
    opt.textContent = comp.label || comp.icon || comp.id
    compSel.appendChild(opt)
  }
}

// ── Show/hide form ─────────────────────────────────────

function showCronForm(): void {
  inp('cron-label').value   = ''
  inp('cron-expr').value    = ''
  inp('cron-enabled').checked = true
  populateCronPageSelect()
  el('cron-form').style.display = ''
  el('cron-add-btn').style.display = 'none'
}

function hideCronForm(): void {
  el('cron-form').style.display = 'none'
  el('cron-add-btn').style.display = ''
}

function saveCron(): void {
  if (!state.config) return
  const label   = inp('cron-label').value.trim()
  const cron    = inp('cron-expr').value.trim()
  const pageId  = sel('cron-page').value
  const compId  = sel('cron-comp').value
  const enabled = inp('cron-enabled').checked

  if (!cron || !pageId || !compId) return

  const trigger: CronTrigger = {
    id:      `cron-${Date.now()}`,
    cron,
    pageId,
    compId,
    enabled,
  }
  if (label) trigger.label = label

  if (!state.config.crons) state.config.crons = []
  state.config.crons.push(trigger)
  pushConfig()
  renderCronList()
  hideCronForm()
}

// ── Wire events ────────────────────────────────────────

export function setupCronUI(): void {
  el('cron-add-btn').addEventListener('click', showCronForm)
  el('cron-cancel-btn').addEventListener('click', hideCronForm)
  el('cron-save-btn').addEventListener('click', saveCron)
  sel('cron-page').addEventListener('change', populateCronCompSelect)
}
