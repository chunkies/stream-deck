import { send } from '../ws.js'

export function createSpotifyTile(comp, page) {
  const cell = document.createElement('div')
  cell.className        = 'spotify-cell'
  cell.style.background = comp.color || '#0f172a'
  cell.innerHTML = `
    <div class="spotify-art"></div>
    <div class="spotify-overlay">
      <div class="spotify-status">—</div>
      <div class="spotify-title">Nothing playing</div>
      <div class="spotify-artist"></div>
    </div>
  `
  cell.addEventListener('pointerdown', () => {
    Haptic.tap()
    cell.classList.add('pressed')
    setTimeout(() => cell.classList.remove('pressed'), 150)
    send({ type: 'press', pageId: page.id, compId: comp.id, hold: false })
  })
  return cell
}

export function updateSpotifyTile(spotifyState) {
  document.querySelectorAll('.spotify-cell').forEach(cell => {
    const artEl    = cell.querySelector('.spotify-art')
    const titleEl  = cell.querySelector('.spotify-title')
    const artistEl = cell.querySelector('.spotify-artist')
    const statusEl = cell.querySelector('.spotify-status')

    titleEl.textContent  = spotifyState.title  || 'Nothing playing'
    artistEl.textContent = spotifyState.artist || ''
    statusEl.textContent = spotifyState.isPlaying ? '▶' : (spotifyState.title ? '⏸' : '—')

    if (spotifyState.artVersion) {
      artEl.style.backgroundImage = `url(${location.origin}/media/spotify-art.jpg?v=${spotifyState.artVersion})`
    } else {
      artEl.style.backgroundImage = ''
    }
  })
}
