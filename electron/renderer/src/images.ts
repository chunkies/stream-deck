import { state } from './state'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }

export function showImagePreview(previewId: string, clearId: string, url: string): void {
  if (!state.serverInfo) return
  el(previewId).style.backgroundImage = `url(https://${state.serverInfo.ip}:${state.serverInfo.port}${url})`
  el(previewId).style.display = 'block'
  el(clearId).style.display   = 'inline-block'
}

export function hideImagePreview(previewId: string, clearId: string): void {
  el(previewId).style.display = 'none'
  el(clearId).style.display   = 'none'
}

export function setImageField(previewId: string, clearId: string, url: string | null | undefined): void {
  if (url && state.serverInfo) showImagePreview(previewId, clearId, url)
  else hideImagePreview(previewId, clearId)
}

interface UploadPair {
  btn:     string
  clear:   string
  input:   string
  preview: string
  field:   'image' | 'activeImage'
}

export function wireImageUploads(): void {
  const pairs: UploadPair[] = [
    { btn: 't-img-upload-btn',        clear: 't-img-clear-btn',        input: 't-img-file-input',        preview: 't-img-preview',        field: 'image'       },
    { btn: 't-active-img-upload-btn', clear: 't-active-img-clear-btn', input: 't-active-img-file-input', preview: 't-active-img-preview', field: 'activeImage' },
  ]
  for (const { btn, clear, input, preview, field } of pairs) {
    el(btn).addEventListener('click', () => (el(input) as HTMLInputElement).click())
    el(input).addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const url = await window.api.uploadMedia((file as File & { path: string }).path)
      state.pendingImages[field] = url
      showImagePreview(preview, clear, url)
    })
    el(clear).addEventListener('click', () => {
      state.pendingImages[field] = null
      hideImagePreview(preview, clear)
      ;(el(input) as HTMLInputElement).value = ''
    })
  }
}
