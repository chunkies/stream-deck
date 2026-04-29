// @ts-nocheck
import { state } from './state'

export function showImagePreview(previewId, clearId, url) {
  if (!state.serverInfo) return
  const el = document.getElementById(previewId)
  el.style.backgroundImage = `url(https://${state.serverInfo.ip}:${state.serverInfo.port}${url})`
  el.style.display = 'block'
  document.getElementById(clearId).style.display = 'inline-block'
}

export function hideImagePreview(previewId, clearId) {
  document.getElementById(previewId).style.display = 'none'
  document.getElementById(clearId).style.display = 'none'
}

export function setImageField(previewId, clearId, url) {
  if (url && state.serverInfo) showImagePreview(previewId, clearId, url)
  else hideImagePreview(previewId, clearId)
}

export function wireImageUploads() {
  const pairs = [
    { btn: 't-img-upload-btn',        clear: 't-img-clear-btn',        input: 't-img-file-input',        preview: 't-img-preview',        field: 'image'       },
    { btn: 't-active-img-upload-btn', clear: 't-active-img-clear-btn', input: 't-active-img-file-input', preview: 't-active-img-preview', field: 'activeImage' },
  ]
  for (const { btn, clear, input, preview, field } of pairs) {
    document.getElementById(btn).addEventListener('click', () => document.getElementById(input).click())
    document.getElementById(input).addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const url = await window.api.uploadMedia(file.path)
      state.pendingImages[field] = url
      showImagePreview(preview, clear, url)
    })
    document.getElementById(clear).addEventListener('click', () => {
      state.pendingImages[field] = null
      hideImagePreview(preview, clear)
      document.getElementById(input).value = ''
    })
  }
}
