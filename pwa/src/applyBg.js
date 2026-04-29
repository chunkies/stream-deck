export function valueToPct(v, min, max) { return ((v - min) / (max - min)) * 100 }

export function applyBg(el, color, image) {
  if (image) {
    el.style.backgroundImage    = `url(${image})`
    el.style.backgroundSize     = 'cover'
    el.style.backgroundPosition = 'center'
    el.style.backgroundColor    = color || '#1e293b'
  } else {
    el.style.backgroundImage = ''
    el.style.background      = color || '#1e293b'
  }
}
