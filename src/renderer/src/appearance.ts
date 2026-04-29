// @ts-nocheck
import { state } from './state'
import { SOLID_SWATCHES, GRADIENT_SWATCHES, ACTIVE_SWATCHES, EMOJI_DATA, ALL_EMOJIS } from './constants'

export function initAppearanceEditor() {
  // Solid swatches
  const solidCtn = document.getElementById('ea-solid-swatches')
  for (const color of SOLID_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset.color = color; s.title = color
    s.addEventListener('click', () => {
      state.currentGradient = null
      document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(g => g.classList.remove('selected'))
      document.getElementById('ea-color').value = color
      highlightSwatch('ea-solid-swatches', color)
      updatePreviewNow()
    })
    solidCtn.appendChild(s)
  }

  // Gradient swatches
  const gradCtn = document.getElementById('ea-gradient-swatches')
  for (const g of GRADIENT_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'gradient-swatch'; s.style.background = g.value; s.dataset.gradient = g.value; s.title = g.label
    s.addEventListener('click', () => {
      state.currentGradient = g.value
      document.querySelectorAll('#ea-solid-swatches .swatch').forEach(sw => sw.classList.remove('selected'))
      highlightGradientSwatch(g.value)
      updatePreviewNow()
    })
    gradCtn.appendChild(s)
  }

  // Active color swatches (switch)
  const activeCtn = document.getElementById('ea-active-swatches')
  for (const color of ACTIVE_SWATCHES) {
    const s = document.createElement('div')
    s.className = 'swatch'; s.style.background = color; s.dataset.color = color
    s.addEventListener('click', () => {
      document.getElementById('ea-active-color').value = color
      document.getElementById('t-active-color').value  = color
      highlightSwatch('ea-active-swatches', color)
    })
    activeCtn.appendChild(s)
  }

  // Emoji toggle
  const emojiPanel  = document.getElementById('ea-emoji-panel')
  const emojiToggle = document.getElementById('ea-emoji-toggle')
  let emojiInited   = false
  emojiToggle.addEventListener('click', () => {
    const open = emojiPanel.style.display === 'none'
    emojiPanel.style.display = open ? '' : 'none'
    emojiToggle.textContent  = open ? 'Close ▴' : 'Pick emoji ▾'
    if (open && !emojiInited) { emojiInited = true; renderEmojiCats(); renderEmojiGrid(state.currentEmojiCat) }
  })

  // Emoji search
  document.getElementById('ea-emoji-search').addEventListener('input', (e) => {
    const q = e.target.value.trim()
    renderEmojiGridItems(q ? ALL_EMOJIS.filter(em => em.includes(q)) : EMOJI_DATA[state.currentEmojiCat])
  })

  // Color inputs → preview
  document.getElementById('ea-color').addEventListener('input', () => { state.currentGradient = null; updatePreviewNow() })
  document.getElementById('ea-active-color').addEventListener('input', e => {
    document.getElementById('t-active-color').value = e.target.value
  })
  document.getElementById('ea-icon').addEventListener('input', updatePreviewNow)
  document.getElementById('ea-label').addEventListener('input', updatePreviewNow)
  document.getElementById('ea-img-url').addEventListener('input', updatePreviewNow)

  // Image upload (ea)
  document.getElementById('ea-img-upload-btn').addEventListener('click', () => document.getElementById('ea-img-file').click())
  document.getElementById('ea-img-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const url = await window.api.uploadMedia(file.path)
    state.pendingImages.image = url
    showEaImagePreview(url)
    updatePreviewNow()
  })
  document.getElementById('ea-img-clear-btn').addEventListener('click', () => {
    state.pendingImages.image = null
    document.getElementById('ea-img-preview').style.display     = 'none'
    document.getElementById('ea-img-clear-btn').style.display   = 'none'
    document.getElementById('ea-img-file').value                = ''
    document.getElementById('ea-img-url').value                 = ''
    updatePreviewNow()
  })
}

export function renderEmojiCats() {
  const catsEl = document.getElementById('ea-emoji-cats')
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
      document.getElementById('ea-emoji-search').value = ''
      catsEl.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderEmojiGrid(cat.key)
    })
    catsEl.appendChild(btn)
  }
}

export function renderEmojiGrid(cat) { renderEmojiGridItems(EMOJI_DATA[cat] || ALL_EMOJIS) }

export function renderEmojiGridItems(emojis) {
  const grid = document.getElementById('ea-emoji-grid')
  grid.innerHTML = ''
  for (const em of emojis) {
    const btn = document.createElement('div')
    btn.className = 'emoji-item'; btn.textContent = em
    btn.addEventListener('click', () => {
      document.getElementById('ea-icon').value = em
      updatePreviewNow()
      document.getElementById('ea-emoji-panel').style.display = 'none'
      document.getElementById('ea-emoji-toggle').textContent  = 'Pick emoji ▾'
    })
    grid.appendChild(btn)
  }
}

export function highlightSwatch(containerId, color) {
  document.querySelectorAll(`#${containerId} .swatch`).forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color)
  })
}

export function highlightGradientSwatch(gradient) {
  document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.gradient === gradient)
  })
}

export function showEaImagePreview(url) {
  if (!url) return
  const full = url.startsWith('http') ? url : (state.serverInfo ? `https://${state.serverInfo.ip}:${state.serverInfo.port}${url}` : url)
  const el = document.getElementById('ea-img-preview')
  el.style.backgroundImage = `url(${full})`
  el.style.display = 'block'
  document.getElementById('ea-img-clear-btn').style.display = 'inline-block'
}

export function updatePreviewNow() {
  const icon    = document.getElementById('ea-icon').value
  const label   = document.getElementById('ea-label').value
  const color   = document.getElementById('ea-color').value
  const imgUrl  = document.getElementById('ea-img-url').value.trim()
  const preview = document.getElementById('ea-preview')

  preview.style.background = state.currentGradient || color

  if (imgUrl) {
    preview.style.backgroundImage    = `url(${imgUrl})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else if (state.pendingImages.image && state.serverInfo) {
    const full = state.pendingImages.image.startsWith('http') ? state.pendingImages.image : `https://${state.serverInfo.ip}:${state.serverInfo.port}${state.pendingImages.image}`
    preview.style.backgroundImage    = `url(${full})`
    preview.style.backgroundSize     = 'cover'
    preview.style.backgroundPosition = 'center'
  } else {
    preview.style.backgroundImage = ''
  }

  document.getElementById('ea-preview-icon').textContent  = icon
  document.getElementById('ea-preview-label').textContent = label
}

export function setAppearanceFromComp(comp, uiType) {
  const defaultColor = ['tile','spotify','plugin-tile'].includes(uiType) ? '#0f172a' : '#1e293b'
  const saved = comp?.color || defaultColor

  document.getElementById('ea-icon').value    = comp?.icon  || ''
  document.getElementById('ea-label').value   = comp?.label || ''
  document.getElementById('ea-img-url').value = ''
  document.getElementById('ea-emoji-panel').style.display = 'none'
  document.getElementById('ea-emoji-toggle').textContent  = 'Pick emoji ▾'

  document.querySelectorAll('#ea-solid-swatches .swatch').forEach(s => s.classList.remove('selected'))
  document.querySelectorAll('#ea-gradient-swatches .gradient-swatch').forEach(s => s.classList.remove('selected'))

  if (saved.startsWith('linear-gradient') || saved.startsWith('radial-gradient')) {
    state.currentGradient = saved
    document.getElementById('ea-color').value = defaultColor
    highlightGradientSwatch(saved)
  } else {
    state.currentGradient = null
    document.getElementById('ea-color').value = saved
    highlightSwatch('ea-solid-swatches', saved)
  }

  if (comp?.image) showEaImagePreview(comp.image)
  else {
    document.getElementById('ea-img-preview').style.display   = 'none'
    document.getElementById('ea-img-clear-btn').style.display = 'none'
  }

  const hasIcon   = ['button','voice','folder'].includes(uiType)
  const hasImage  = !['spotify'].includes(uiType)
  const hasLabel  = uiType !== 'spotify'
  const hasActive = uiType === 'switch'

  document.getElementById('ea-icon-section').style.display   = hasIcon   ? '' : 'none'
  document.getElementById('ea-label-section').style.display  = hasLabel  ? '' : 'none'
  document.getElementById('ea-image-section').style.display  = hasImage  ? '' : 'none'
  document.getElementById('ea-active-section').style.display = hasActive ? '' : 'none'

  if (hasActive) {
    const ac = comp?.activeColor || '#4f46e5'
    document.getElementById('ea-active-color').value = ac
    document.getElementById('t-active-color').value  = ac
    highlightSwatch('ea-active-swatches', ac)
  }

  updatePreviewNow()
}

export function getAppearanceFields(existing) {
  const imgUrl = document.getElementById('ea-img-url').value.trim()
  let image
  if (imgUrl) {
    image = imgUrl
  } else if (state.pendingImages.image !== undefined) {
    image = state.pendingImages.image
  } else {
    image = existing?.image ?? null
  }
  return {
    label: document.getElementById('ea-label').value.trim(),
    icon:  document.getElementById('ea-icon').value.trim(),
    color: state.currentGradient || document.getElementById('ea-color').value,
    image,
  }
}
