import type { Component } from '../../shared/types'
import { state } from './state'
import { SOLID_SWATCHES, GRADIENT_SWATCHES, ACTIVE_SWATCHES, EMOJI_DATA, ALL_EMOJIS } from './constants'

function el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement }
function inp(id: string): HTMLInputElement { return document.getElementById(id) as HTMLInputElement }

export function initAppearanceEditor(): void {
  const solidCtn = el('ea-solid-swatches')
  for (const color of SOLID_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset['color'] = color; s.title = color
    s.addEventListener('click', () => {
      state.currentGradient = null
      document.querySelectorAll<HTMLElement>('#ea-gradient-swatches .gradient-swatch').forEach(g => g.classList.remove('selected'))
      inp('ea-color').value = color
      highlightSwatch('ea-solid-swatches', color)
      updatePreviewNow()
    })
    solidCtn.appendChild(s)
  }

  const gradCtn = el('ea-gradient-swatches')
  for (const g of GRADIENT_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'gradient-swatch'; s.style.background = g.value; s.dataset['gradient'] = g.value; s.title = g.label
    s.addEventListener('click', () => {
      state.currentGradient = g.value
      document.querySelectorAll<HTMLElement>('#ea-solid-swatches .swatch').forEach(sw => sw.classList.remove('selected'))
      highlightGradientSwatch(g.value)
      updatePreviewNow()
    })
    gradCtn.appendChild(s)
  }

  const activeCtn = el('ea-active-swatches')
  for (const color of ACTIVE_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset['color'] = color
    s.addEventListener('click', () => {
      inp('ea-active-color').value = color
      inp('t-active-color').value  = color
      highlightSwatch('ea-active-swatches', color)
    })
    activeCtn.appendChild(s)
  }

  const emojiPanel  = el('ea-emoji-panel')
  const emojiToggle = el('ea-emoji-toggle')
  let emojiInited   = false
  emojiToggle.addEventListener('click', () => {
    const open = emojiPanel.style.display === 'none'
    emojiPanel.style.display = open ? '' : 'none'
    emojiToggle.textContent  = open ? 'Close ▴' : 'Pick emoji ▾'
    if (open && !emojiInited) { emojiInited = true; renderEmojiCats(); renderEmojiGrid(state.currentEmojiCat) }
  })

  el('ea-emoji-search').addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim()
    renderEmojiGridItems(q ? ALL_EMOJIS.filter(em => em.includes(q)) : EMOJI_DATA[state.currentEmojiCat] ?? [])
  })

  inp('ea-color').addEventListener('input', () => { state.currentGradient = null; updatePreviewNow() })
  inp('ea-active-color').addEventListener('input', e => {
    inp('t-active-color').value = (e.target as HTMLInputElement).value
  })
  el('ea-icon').addEventListener('input', updatePreviewNow)
  el('ea-label').addEventListener('input', updatePreviewNow)
  el('ea-img-url').addEventListener('input', updatePreviewNow)

  el('ea-img-upload-btn').addEventListener('click', () => el('ea-img-file').click())
  el('ea-img-file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const url = await window.api.uploadMedia((file as File & { path: string }).path)
    state.pendingImages.image = url
    showEaImagePreview(url)
    updatePreviewNow()
  })
  el('ea-img-clear-btn').addEventListener('click', () => {
    state.pendingImages.image = null
    el('ea-img-preview').style.display   = 'none'
    el('ea-img-clear-btn').style.display = 'none'
    inp('ea-img-file').value             = ''
    inp('ea-img-url').value              = ''
    updatePreviewNow()
  })
}

export function renderEmojiCats(): void {
  const catsEl = el('ea-emoji-cats')
  catsEl.innerHTML = ''
  const cats = [
    { key: 'smileys',  icon: '😊' }, { key: 'gestures', icon: '👋' },
    { key: 'nature',   icon: '🌿' }, { key: 'objects',  icon: '💡' },
    { key: 'symbols',  icon: '⭐' }, { key: 'tech',     icon: '💻' },
    { key: 'gaming',   icon: '🎮' }, { key: 'media',    icon: '🎵' },
  ]
  for (const cat of cats) {
    const btn = document.createElement('button')
    btn.className = 'emoji-cat' + (cat.key === state.currentEmojiCat ? ' active' : '')
    btn.title = cat.key; btn.textContent = cat.icon
    btn.addEventListener('click', () => {
      state.currentEmojiCat = cat.key
      inp('ea-emoji-search').value = ''
      catsEl.querySelectorAll<HTMLElement>('.emoji-cat').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderEmojiGrid(cat.key)
    })
    catsEl.appendChild(btn)
  }
}

export function renderEmojiGrid(cat: string): void { renderEmojiGridItems(EMOJI_DATA[cat] ?? ALL_EMOJIS) }

export function renderEmojiGridItems(emojis: string[]): void {
  const grid = el('ea-emoji-grid')
  grid.innerHTML = ''
  for (const em of emojis) {
    const btn = document.createElement('div')
    btn.className = 'emoji-item'; btn.textContent = em
    btn.addEventListener('click', () => {
      inp('ea-icon').value = em
      updatePreviewNow()
      el('ea-emoji-panel').style.display = 'none'
      el('ea-emoji-toggle').textContent  = 'Pick emoji ▾'
    })
    grid.appendChild(btn)
  }
}

export function highlightSwatch(containerId: string, color: string): void {
  document.querySelectorAll<HTMLElement>(`#${containerId} .swatch`).forEach(s => {
    s.classList.toggle('selected', s.dataset['color'] === color)
  })
}

export function highlightGradientSwatch(gradient: string): void {
  document.querySelectorAll<HTMLElement>('#ea-gradient-swatches .gradient-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset['gradient'] === gradient)
  })
}

export function showEaImagePreview(url: string): void {
  if (!url) return
  const full = url.startsWith('http') ? url : (state.serverInfo ? `https://${state.serverInfo.ip}:${state.serverInfo.port}${url}` : url)
  const preview = el('ea-img-preview')
  preview.style.backgroundImage = `url(${full})`
  preview.style.display = 'block'
  el('ea-img-clear-btn').style.display = 'inline-block'
}

export function updatePreviewNow(): void {
  const icon    = inp('ea-icon').value
  const label   = inp('ea-label').value
  const color   = inp('ea-color').value
  const imgUrl  = inp('ea-img-url').value.trim()
  const preview = el('ea-preview')

  preview.style.background = state.currentGradient || color

  if (imgUrl) {
    preview.style.backgroundImage    = `url(${imgUrl})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else if (state.pendingImages.image && state.serverInfo) {
    const full = state.pendingImages.image.startsWith('http')
      ? state.pendingImages.image
      : `https://${state.serverInfo.ip}:${state.serverInfo.port}${state.pendingImages.image}`
    preview.style.backgroundImage    = `url(${full})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else {
    preview.style.backgroundImage = ''
  }

  el('ea-preview-icon').textContent  = icon
  el('ea-preview-label').textContent = label
}

export function setAppearanceFromComp(comp: Partial<Component> | null, uiType: string): void {
  const defaultColor = ['tile', 'spotify', 'plugin-tile'].includes(uiType) ? '#0f172a' : '#1e293b'
  const saved = comp?.color || defaultColor

  inp('ea-icon').value    = comp?.icon  || ''
  inp('ea-label').value   = comp?.label || ''
  inp('ea-img-url').value = ''
  el('ea-emoji-panel').style.display = 'none'
  el('ea-emoji-toggle').textContent  = 'Pick emoji ▾'

  document.querySelectorAll<HTMLElement>('#ea-solid-swatches .swatch').forEach(s => s.classList.remove('selected'))
  document.querySelectorAll<HTMLElement>('#ea-gradient-swatches .gradient-swatch').forEach(s => s.classList.remove('selected'))

  if (saved.startsWith('linear-gradient') || saved.startsWith('radial-gradient')) {
    state.currentGradient = saved
    inp('ea-color').value = defaultColor
    highlightGradientSwatch(saved)
  } else {
    state.currentGradient = null
    inp('ea-color').value = saved
    highlightSwatch('ea-solid-swatches', saved)
  }

  if (comp?.image) showEaImagePreview(comp.image)
  else {
    el('ea-img-preview').style.display   = 'none'
    el('ea-img-clear-btn').style.display = 'none'
  }

  const hasIcon   = ['button', 'voice', 'folder'].includes(uiType)
  const hasImage  = !['spotify'].includes(uiType)
  const hasLabel  = uiType !== 'spotify'
  const hasActive = uiType === 'switch'

  el('ea-icon-section').style.display   = hasIcon   ? '' : 'none'
  el('ea-label-section').style.display  = hasLabel  ? '' : 'none'
  el('ea-image-section').style.display  = hasImage  ? '' : 'none'
  el('ea-active-section').style.display = hasActive ? '' : 'none'

  if (hasActive) {
    const ac = comp?.activeColor || '#4f46e5'
    inp('ea-active-color').value = ac
    inp('t-active-color').value  = ac
    highlightSwatch('ea-active-swatches', ac)
  }

  updatePreviewNow()
}

export function getAppearanceFields(existing: Partial<Component> | null): { label: string; icon: string; color: string; image: string | null } {
  const imgUrl = inp('ea-img-url').value.trim()
  let image: string | null
  if (imgUrl) {
    image = imgUrl
  } else if (state.pendingImages.image !== undefined) {
    image = state.pendingImages.image ?? null
  } else {
    image = existing?.image ?? null
  }
  return {
    label: inp('ea-label').value.trim(),
    icon:  inp('ea-icon').value.trim(),
    color: state.currentGradient || inp('ea-color').value,
    image,
  }
}
