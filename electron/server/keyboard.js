const { execSync } = require('child_process')
const os = require('os')

const OS = os.platform()

// Windows P/Invoke to send virtual media/volume keys (no extra software needed)
const winKey = (vk) =>
  `powershell -c "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\\\"user32\\\")]public static extern void keybd_event(byte v,byte s,uint f,int e);}'; [K]::keybd_event(${vk},0,0,0);[K]::keybd_event(${vk},0,2,0)"`

// Cross-platform built-in actions
// Linux:  playerctl + wpctl (PipeWire) + xdg-screensaver
// Mac:    osascript built-in; playerctl via `brew install playerctl`
// Win:    nothing extra required
const BUILTIN = {
  'media.playPause':  { label: 'Play / Pause',    linux: 'playerctl play-pause', darwin: 'playerctl play-pause', win32: winKey(0xB3) },
  'media.next':       { label: 'Next Track',       linux: 'playerctl next',       darwin: 'playerctl next',       win32: winKey(0xB0) },
  'media.previous':   { label: 'Previous Track',   linux: 'playerctl previous',   darwin: 'playerctl previous',   win32: winKey(0xB1) },
  'media.volumeUp':   { label: 'Volume Up',        linux: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+',  darwin: `osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'`, win32: winKey(0xAF) },
  'media.volumeDown': { label: 'Volume Down',      linux: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-',  darwin: `osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'`, win32: winKey(0xAE) },
  'media.mute':       { label: 'Mute Audio',       linux: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle', darwin: `osascript -e 'set volume output muted not (output muted of (get volume settings))'`,    win32: winKey(0xAD) },
  'system.lock':      { label: 'Lock Screen',      linux: 'xdg-screensaver lock', darwin: `osascript -e 'tell application "System Events" to keystroke "q" using {command down, control down}'`, win32: 'rundll32.exe user32.dll,LockWorkStation' },
  'system.sleep':     { label: 'Sleep',            linux: 'systemctl suspend',    darwin: 'pmset sleepnow', win32: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0' },
  'system.screenshot':{ label: 'Screenshot',       linux: 'scrot -d 0 ~/Desktop/screenshot-$(date +%Y%m%d-%H%M%S).png 2>/dev/null || gnome-screenshot', darwin: `osascript -e 'tell application "System Events" to keystroke "4" using {shift down, command down}'`, win32: 'powershell -c "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'%{PRTSC}\')"' }
}

function executeBuiltin(key) {
  const action = BUILTIN[key]
  if (!action) { console.error('Unknown builtin:', key); return }
  executeCommand(action[OS] ?? action.linux)
}

function executeCommand(command) {
  if (!command?.trim()) return
  try {
    execSync(command, { shell: OS === 'win32' ? 'cmd.exe' : '/bin/sh', timeout: 5000 })
  } catch (err) {
    console.error('Command failed:', err.message)
  }
}

module.exports = { executeCommand, executeBuiltin, BUILTIN, OS }
