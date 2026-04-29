import { execSync } from 'child_process'
import { platform } from 'os'
import { PLATFORMS } from './constants'

export const OS = platform()

// Only keysym characters allowed in hotkey combos — prevents shell injection
const SAFE_COMBO_RE = /^[a-zA-Z0-9+\-_]+$/

// Windows P/Invoke to send virtual media/volume keys (no extra software needed)
const winKey = (vk: number): string =>
  `powershell -c "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\\\"user32\\\")]public static extern void keybd_event(byte v,byte s,uint f,int e);}'; [K]::keybd_event(${vk},0,0,0);[K]::keybd_event(${vk},0,2,0)"`

type BuiltinEntry = { label: string } & Record<string, string>

// Cross-platform built-in actions
// Linux:  playerctl + wpctl (PipeWire) + xdg-screensaver
// Mac:    osascript built-in; playerctl via `brew install playerctl`
// Win:    nothing extra required
export const BUILTIN: Record<string, BuiltinEntry> = {
  'media.playPause':  { label: 'Play / Pause',    [PLATFORMS.LINUX]: 'playerctl play-pause', [PLATFORMS.DARWIN]: 'playerctl play-pause', [PLATFORMS.WINDOWS]: winKey(0xB3) },
  'media.next':       { label: 'Next Track',       [PLATFORMS.LINUX]: 'playerctl next',       [PLATFORMS.DARWIN]: 'playerctl next',       [PLATFORMS.WINDOWS]: winKey(0xB0) },
  'media.previous':   { label: 'Previous Track',   [PLATFORMS.LINUX]: 'playerctl previous',   [PLATFORMS.DARWIN]: 'playerctl previous',   [PLATFORMS.WINDOWS]: winKey(0xB1) },
  'media.volumeUp':   { label: 'Volume Up',        [PLATFORMS.LINUX]: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+',  [PLATFORMS.DARWIN]: `osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'`, [PLATFORMS.WINDOWS]: winKey(0xAF) },
  'media.volumeDown': { label: 'Volume Down',      [PLATFORMS.LINUX]: 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-',  [PLATFORMS.DARWIN]: `osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'`, [PLATFORMS.WINDOWS]: winKey(0xAE) },
  'media.mute':       { label: 'Mute Audio',       [PLATFORMS.LINUX]: 'wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle', [PLATFORMS.DARWIN]: `osascript -e 'set volume output muted not (output muted of (get volume settings))'`,    [PLATFORMS.WINDOWS]: winKey(0xAD) },
  'system.lock':      { label: 'Lock Screen',      [PLATFORMS.LINUX]: 'xdg-screensaver lock', [PLATFORMS.DARWIN]: `osascript -e 'tell application "System Events" to keystroke "q" using {command down, control down}'`, [PLATFORMS.WINDOWS]: 'rundll32.exe user32.dll,LockWorkStation' },
  'system.sleep':     { label: 'Sleep',            [PLATFORMS.LINUX]: 'systemctl suspend',    [PLATFORMS.DARWIN]: 'pmset sleepnow', [PLATFORMS.WINDOWS]: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0' },
  'system.screenshot':{ label: 'Screenshot',       [PLATFORMS.LINUX]: 'scrot -d 0 ~/Desktop/screenshot-$(date +%Y%m%d-%H%M%S).png 2>/dev/null || gnome-screenshot', [PLATFORMS.DARWIN]: `osascript -e 'tell application "System Events" to keystroke "4" using {shift down, command down}'`, [PLATFORMS.WINDOWS]: 'powershell -c "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'%{PRTSC}\')"' },
  'spotify.shuffle':  { label: '🔀 Shuffle Toggle', [PLATFORMS.LINUX]: 'playerctl shuffle Toggle', [PLATFORMS.DARWIN]: `osascript -e 'tell application "Spotify" to set shuffling to not shuffling'`, [PLATFORMS.WINDOWS]: winKey(0xB3) },
  'spotify.repeat':   { label: '🔁 Repeat Toggle',  [PLATFORMS.LINUX]: 'playerctl loop None', [PLATFORMS.DARWIN]: `osascript -e 'tell application "Spotify" to set repeating to not repeating'`, [PLATFORMS.WINDOWS]: winKey(0xB3) },
  'spotify.seekFwd':  { label: '⏩ Seek +10s',      [PLATFORMS.LINUX]: 'playerctl position 10+', [PLATFORMS.DARWIN]: `osascript -e 'tell application "Spotify" to set player position to (player position + 10)'`, [PLATFORMS.WINDOWS]: winKey(0xB3) },
  'spotify.seekBack': { label: '⏪ Seek -10s',      [PLATFORMS.LINUX]: 'playerctl position 10-', [PLATFORMS.DARWIN]: `osascript -e 'tell application "Spotify" to set player position to (player position - 10)'`, [PLATFORMS.WINDOWS]: winKey(0xB3) },
}

export function executeBuiltin(key: string): void {
  const action = BUILTIN[key]
  if (!action) { console.error('Unknown builtin:', key); return }
  executeCommand(action[OS] ?? action[PLATFORMS.LINUX])
}

export function executeHotkey(combo: string | undefined): void {
  if (!combo?.trim()) return
  if (!SAFE_COMBO_RE.test(combo)) {
    console.error('Rejected unsafe hotkey combo:', combo)
    return
  }
  if (OS === PLATFORMS.LINUX) {
    executeCommand(`xdotool key --clearmodifiers ${combo}`)
  } else if (OS === PLATFORMS.DARWIN) {
    const parts = combo.toLowerCase().split('+')
    const key   = parts.pop()
    const modMap: Record<string, string> = { ctrl: 'control', cmd: 'command', command: 'command', super: 'command', win: 'command', alt: 'option', shift: 'shift' }
    const mods  = parts.map(m => (modMap[m] || m) + ' down').join(', ')
    const modsStr = mods ? `using {${mods}}` : ''
    executeCommand(`osascript -e 'tell application "System Events" to keystroke "${key}" ${modsStr}'`)
  } else {
    const parts = combo.toLowerCase().split('+')
    const key   = parts.pop()
    const keyMap: Record<string, string> = { f1:'{F1}',f2:'{F2}',f3:'{F3}',f4:'{F4}',f5:'{F5}',f6:'{F6}',f7:'{F7}',f8:'{F8}',f9:'{F9}',f10:'{F10}',f11:'{F11}',f12:'{F12}',return:'{ENTER}',enter:'{ENTER}',escape:'{ESC}',tab:'{TAB}',backspace:'{BACKSPACE}',delete:'{DELETE}',space:' ' }
    const prefix = parts.map(m => ({ ctrl: '^', alt: '%', shift: '+' } as Record<string, string>)[m] || '').join('')
    const k = keyMap[key!] || key!
    executeCommand(`powershell -c "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${prefix}${k}')"`)
  }
}

export function executeCommand(command: string | undefined): void {
  if (!command?.trim()) return
  try {
    execSync(command, { shell: OS === PLATFORMS.WINDOWS ? 'cmd.exe' : '/bin/sh', timeout: 5000 })
  } catch (err) {
    console.error('Command failed:', (err as Error).message)
  }
}
