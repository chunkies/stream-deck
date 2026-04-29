// @ts-nocheck
import { adminPages, setAdminIdx } from './state'
import { pushConfig } from './config'
import { renderAll } from './grid'

export function closePageModal() { document.getElementById('page-modal').style.display = 'none' }

export function saveNewPage() {
  const name = document.getElementById('f-page-name').value.trim()
  if (!name) return
  const pageCols = parseInt(document.getElementById('f-page-cols').value) || undefined
  const page     = { id: 'page-' + Date.now(), name, components: [] }
  if (pageCols) page.cols = pageCols
  const pages = adminPages()
  pages.push(page)
  setAdminIdx(pages.length - 1)
  pushConfig(); renderAll(); closePageModal()
}

export function openPageModal() {
  document.getElementById('f-page-name').value = ''
  document.getElementById('f-page-cols').value = ''
  document.getElementById('page-modal').style.display = 'flex'
  document.getElementById('f-page-name').focus()
}
