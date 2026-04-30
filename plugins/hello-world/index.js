'use strict'
const { execFileSync } = require('child_process')

module.exports = {
  'hello-world.notify': (params) => {
    const msg = params.message || 'MacroPad says hello!'
    execFileSync('notify-send', ['MacroPad', msg], { timeout: 3000 })
  },

  'hello-world.openUrl': (params) => {
    const url = params.url || 'https://github.com/chunkies/macropad'
    execFileSync('xdg-open', [url], { timeout: 3000 })
  }
}
