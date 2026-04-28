'use strict'

module.exports = function (sdk) {
  const { shell, log } = sdk
  const isMac = process.platform === 'darwin'

  function spotify(cmd) {
    if (isMac) {
      return shell.execAsync(`osascript -e 'tell application "Spotify" to ${cmd}'`)
    }
    return shell.execAsync(`playerctl --player=spotify ${cmd} 2>/dev/null || playerctl ${cmd}`)
  }

  sdk.on('spotify.playPause', async () => {
    if (isMac) await spotify('playpause')
    else await spotify('play-pause')
  })

  sdk.on('spotify.next', async () => {
    if (isMac) await spotify('next track')
    else await spotify('next')
  })

  sdk.on('spotify.previous', async () => {
    if (isMac) await spotify('previous track')
    else await spotify('previous')
  })

  sdk.on('spotify.volumeUp', async ({ value }) => {
    if (isMac) {
      const vol = Math.round(value)
      await shell.execAsync(`osascript -e 'tell application "Spotify" to set sound volume to ${vol}'`)
    } else {
      await shell.execAsync(`playerctl --player=spotify volume ${(value / 100).toFixed(2)}`)
    }
  })

  sdk.on('spotify.volumeDown', async ({ value }) => {
    if (isMac) {
      const vol = Math.round(value)
      await shell.execAsync(`osascript -e 'tell application "Spotify" to set sound volume to ${vol}'`)
    } else {
      await shell.execAsync(`playerctl --player=spotify volume ${(value / 100).toFixed(2)}`)
    }
  })

  // Poll now-playing every 3 seconds and broadcast for tile components
  let pollTimer = null

  async function pollNowPlaying() {
    try {
      let track, artist
      if (isMac) {
        track  = (await shell.execAsync(`osascript -e 'tell application "Spotify" to name of current track'`)).trim()
        artist = (await shell.execAsync(`osascript -e 'tell application "Spotify" to artist of current track'`)).trim()
      } else {
        track  = (await shell.execAsync(`playerctl --player=spotify metadata title 2>/dev/null`)).trim()
        artist = (await shell.execAsync(`playerctl --player=spotify metadata artist 2>/dev/null`)).trim()
      }
      if (track) sdk.broadcast('spotify.nowPlaying', { value: track, track, artist })
    } catch {}
  }

  pollTimer = setInterval(pollNowPlaying, 3000)
  pollNowPlaying()

  return () => { if (pollTimer) clearInterval(pollTimer) }
}
