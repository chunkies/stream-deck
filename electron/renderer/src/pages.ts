import { adminPages, setAdminIdx } from './state'
import { pushConfig } from './config'
import { renderAll } from './grid'
import { TEMPLATES } from './templates'
import type { LayoutTemplate } from './templates'
import type { Page } from '../../shared/types'

function inp(id: string): HTMLInputElement { return document.getElementById(id) as HTMLInputElement }
function el(id: string): HTMLElement       { return document.getElementById(id) as HTMLElement }

let selectedTemplate: LayoutTemplate | null = null

// Wired once at module load — DOM is already parsed when Electron runs module scripts
inp('f-page-name').addEventListener('input', updateCreateBtn)

export function closePageModal(): void { el('page-modal').style.display = 'none' }

export function saveNewPage(): void {
  const name = inp('f-page-name').value.trim()
  if (!name) return

  const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  let page: Page

  if (selectedTemplate) {
    page = {
      id:         'page-' + Date.now(),
      name,
      cols:       selectedTemplate.page.cols,
      components: selectedTemplate.page.components.map(comp => ({ ...comp, id: `tpl-${suffix()}` })),
    }
  } else {
    page = { id: 'page-' + Date.now(), name, components: [] }
  }

  const pages = adminPages()
  pages.push(page)
  setAdminIdx(pages.length - 1)
  pushConfig(); renderAll(); closePageModal()
}

export function openPageModal(): void {
  selectedTemplate = null
  inp('f-page-name').value = ''
  updateCreateBtn()
  renderModalTemplates()
  el('page-modal').style.display = 'flex'
  setTimeout(() => inp('f-page-name').focus(), 30)
}

function updateCreateBtn(): void {
  const btn = el('page-modal-save') as HTMLButtonElement
  btn.disabled = !inp('f-page-name').value.trim()
}

function renderModalTemplates(): void {
  const container = el('page-modal-templates')
  container.innerHTML = ''
  selectedTemplate = null

  for (const tpl of TEMPLATES) {
    const row = document.createElement('div')
    row.className = 'tpl-row'
    row.title = tpl.description

    const left = document.createElement('div')
    left.className = 'tpl-row-left'

    const iconEl = document.createElement('span')
    iconEl.className = 'tpl-row-icon'
    iconEl.textContent = tpl.icon

    const nameEl = document.createElement('span')
    nameEl.className = 'tpl-row-name'
    nameEl.textContent = tpl.name

    left.appendChild(iconEl)
    left.appendChild(nameEl)

    const useBtn = document.createElement('button')
    useBtn.className = 'btn-secondary tpl-use-btn'
    useBtn.textContent = 'Use Template'

    useBtn.addEventListener('click', () => {
      selectedTemplate = tpl
      inp('f-page-name').value = tpl.page.name
      saveNewPage()
    })

    row.appendChild(left)
    row.appendChild(useBtn)
    container.appendChild(row)
  }
}
