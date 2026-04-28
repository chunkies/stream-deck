'use strict'

const { execFileSync } = require('child_process')
const os = require('os')

module.exports = (sdk) => {

  function typeText(text) {
    if (!text) return
    if (os.platform() === 'darwin') {
      // macOS — osascript keystroke (handles most ASCII; for unicode use pbpaste trick)
      const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      execFileSync('osascript', ['-e', `tell application "System Events" to keystroke "${esc}"`], { timeout: 10000 })
    } else {
      // Linux — xdotool type (--delay slows per-char to avoid drop; -- stops flag parsing)
      execFileSync('xdotool', ['type', '--clearmodifiers', '--delay', '20', '--', text], { timeout: 10000 })
    }
  }

  function pressHotkey(combo) {
    if (!combo) return
    if (os.platform() === 'darwin') {
      // Convert xdotool-style combo to osascript: ctrl+s → keystroke "s" using {control down}
      const parts  = combo.toLowerCase().split('+')
      const key    = parts.pop()
      const modMap = { ctrl: 'control down', control: 'control down', cmd: 'command down', super: 'command down', alt: 'option down', shift: 'shift down' }
      const mods   = parts.map(m => modMap[m]).filter(Boolean)
      const using  = mods.length ? ` using {${mods.join(', ')}}` : ''
      execFileSync('osascript', ['-e', `tell application "System Events" to keystroke "${key}"${using}`], { timeout: 5000 })
    } else {
      // Linux — xdotool key accepts xdotool key names (ctrl+s, ctrl+Return, etc.)
      execFileSync('xdotool', ['key', '--clearmodifiers', combo], { timeout: 5000 })
    }
  }

  return {
    'text-macro.run': async (params) => {
      const text   = params?.text   || ''
      const delay  = Math.max(0, parseInt(params?.delay ?? 1000) || 0)
      const hotkey = (params?.hotkey || '').trim()

      sdk.log.info(`run: text="${text.slice(0, 40)}${text.length > 40 ? '…' : ''}" delay=${delay}ms hotkey="${hotkey}"`)

      try {
        typeText(text)
      } catch (err) {
        sdk.log.error('type failed: ' + err.message)
      }

      if (delay > 0) await new Promise(r => setTimeout(r, delay))

      try {
        pressHotkey(hotkey)
      } catch (err) {
        sdk.log.error('hotkey failed: ' + err.message)
      }
    },

    'text-macro.type-only': async (params) => {
      const text = params?.text || ''
      sdk.log.info(`type-only: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`)
      try {
        typeText(text)
      } catch (err) {
        sdk.log.error('type failed: ' + err.message)
      }
    },

    'text-macro.hotkey-only': async (params) => {
      const hotkey = (params?.hotkey || '').trim()
      sdk.log.info(`hotkey-only: "${hotkey}"`)
      try {
        pressHotkey(hotkey)
      } catch (err) {
        sdk.log.error('hotkey failed: ' + err.message)
      }
    }
  }
}
