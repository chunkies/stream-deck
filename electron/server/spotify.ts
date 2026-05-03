import fs   from 'fs'
import path from 'path'
import { exec } from 'child_process'

import { PLATFORMS, MESSAGE_TYPES, TIMINGS } from './constants'
import { OS } from './keyboard'
import type { Config } from '../shared/types'

// ── Spotify state ──────────────────────────────────────
export let spotifyState = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: 0 }

let spotifyTimer:    ReturnType<typeof setInterval> | null = null
let spotifyMediaPath: string | null = null

// Safe base directories for MPRIS file:// art paths
const SAFE_ART_PREFIXES = ['/home', '/tmp', '/var/folders', '/private/var/folders']

export function setSpotifyMediaPath(p: string): void {
  spotifyMediaPath = p
}

export function isArtPathSafe(filePath: string): boolean {
  if (!filePath) return false
  const resolved = path.resolve(filePath)
  return SAFE_ART_PREFIXES.some(prefix => resolved.startsWith(prefix))
}

function spotifyCommand(): string | null {
  if (OS === PLATFORMS.LINUX)  return 'playerctl metadata --format "{{status}}\t{{title}}\t{{artist}}\t{{mpris:artUrl}}" 2>/dev/null'
  if (OS === PLATFORMS.DARWIN) return `osascript -e 'tell application "Spotify" to return (player state as string)&"\\t"&(name of current track)&"\\t"&(artist of current track)&"\\t"&(artwork url of current track)' 2>/dev/null`
  return null
}

async function downloadSpotifyArt(url: string): Promise<boolean> {
  if (!url || !spotifyMediaPath) return false
  try {
    const dest = path.join(spotifyMediaPath, 'spotify-art.jpg')
    if (url.startsWith('file://')) {
      const src = decodeURIComponent(url.slice(7))
      if (!isArtPathSafe(src)) {
        console.warn('Rejected Spotify art path outside safe directories:', src)
        return false
      }
      if (fs.existsSync(src)) { fs.copyFileSync(src, dest); return true }
      return false
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMINGS.SPOTIFY_ART_FETCH_MS) })
    if (!res.ok) return false
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    return true
  } catch { return false }
}

export function pollSpotify(broadcast: (msg: Record<string, unknown>) => void): void {
  const cmd = spotifyCommand()
  if (!cmd) return

  exec(cmd, { timeout: TIMINGS.SPOTIFY_POLL_MS }, async (err, stdout) => {
    if (err || !stdout.trim()) {
      if (spotifyState.title) {
        spotifyState = { title: '', artist: '', isPlaying: false, artUrl: '', artVersion: spotifyState.artVersion }
        broadcast({ type: MESSAGE_TYPES.SPOTIFY_UPDATE, ...spotifyState })
      }
      return
    }
    const [status, title = '', artist = '', artUrl = ''] = stdout.trim().split('\t')
    const isPlaying = status === 'Playing'

    let artVersion = spotifyState.artVersion
    if (artUrl && artUrl !== spotifyState.artUrl) {
      const ok = await downloadSpotifyArt(artUrl)
      if (ok) artVersion = Date.now()
    }

    const changed = title !== spotifyState.title || artist !== spotifyState.artist
                  || isPlaying !== spotifyState.isPlaying || artVersion !== spotifyState.artVersion

    spotifyState = { title, artist, isPlaying, artUrl, artVersion }
    if (changed) broadcast({ type: MESSAGE_TYPES.SPOTIFY_UPDATE, title, artist, isPlaying, artVersion })
  })
}

export function hasSpotifyTile(_config: Config | null): boolean {
  return false
}

export function startSpotifyPoller(config: Config | null, broadcast: (msg: Record<string, unknown>) => void): void {
  stopSpotifyPoller()
  if (!hasSpotifyTile(config)) return
  pollSpotify(broadcast)
  spotifyTimer = setInterval(() => pollSpotify(broadcast), TIMINGS.SPOTIFY_POLL_MS)
}

export function stopSpotifyPoller(): void {
  if (spotifyTimer) { clearInterval(spotifyTimer); spotifyTimer = null }
}
