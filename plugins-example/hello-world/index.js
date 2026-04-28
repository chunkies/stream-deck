'use strict'
const { execSync } = require('child_process')

module.exports = {
  'hello-world.notify': (params) => {
    const msg = params.message || 'Stream Deck says hello!'
    execSync(`notify-send "Stream Deck" "${msg}"`, { timeout: 3000 })
  },

  'hello-world.openUrl': (params) => {
    const url = params.url || 'https://github.com/chunkies/stream-deck'
    execSync(`xdg-open "${url}"`, { timeout: 3000 })
  }
}
