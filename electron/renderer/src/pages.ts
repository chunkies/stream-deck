import { adminPages, setAdminIdx } from './state'
import { pushConfig } from './config'
import { renderAll } from './grid'
import type { Page } from '../../shared/types'

function inp(id: string): HTMLInputElement { return document.getElementById(id) as HTMLInputElement }
function el(id: string): HTMLElement       { return document.getElementById(id) as HTMLElement }

export function closePageModal(): void { el('page-modal').style.display = 'none' }

export function saveNewPage(): void {
  const name = inp('f-page-name').value.trim()
  if (!name) return
  const pageCols = parseInt(inp('f-page-cols').value) || undefined
  const page: Page = { id: 'page-' + Date.now(), name, components: [] }
  if (pageCols) page.cols = pageCols
  const pages = adminPages()
  pages.push(page)
  setAdminIdx(pages.length - 1)
  pushConfig(); renderAll(); closePageModal()
}

export function openPageModal(): void {
  inp('f-page-name').value        = ''
  inp('f-page-cols').value        = ''
  el('page-modal').style.display  = 'flex'
  inp('f-page-name').focus()
}
