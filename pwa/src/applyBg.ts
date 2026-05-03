export function valueToPct(v: number, min: number, max: number): number {
  return ((v - min) / (max - min)) * 100
}

export function applyBg(el: HTMLElement, color: string | undefined, image: string | null | undefined): void {
  if (image) {
    el.style.backgroundImage    = `url(${image})`
    el.style.backgroundSize     = 'cover'
    el.style.backgroundPosition = 'center'
    el.style.backgroundColor    = color ?? '#1e293b'
  } else {
    el.style.backgroundImage = ''
    el.style.background      = color ?? '#1e293b'
  }
}
