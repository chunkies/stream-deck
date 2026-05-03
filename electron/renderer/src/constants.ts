export interface BuiltinAction {
  group: string
  key:   string
  label: string
}

export const BUILTIN_ACTIONS: BuiltinAction[] = [
  { group: 'Media',  key: 'media.playPause',   label: '⏯  Play / Pause'   },
  { group: 'Media',  key: 'media.next',         label: '⏭  Next Track'     },
  { group: 'Media',  key: 'media.previous',     label: '⏮  Previous Track' },
  { group: 'Media',  key: 'media.volumeUp',     label: '🔊  Volume Up'      },
  { group: 'Media',  key: 'media.volumeDown',   label: '🔉  Volume Down'    },
  { group: 'Media',  key: 'media.mute',         label: '🔇  Mute Audio'     },
  { group: 'System', key: 'system.lock',        label: '🔒  Lock Screen'    },
  { group: 'System', key: 'system.sleep',       label: '💤  Sleep'          },
  { group: 'System', key: 'system.screenshot',  label: '📷  Screenshot'     },
]

export const COMP_TYPE_LABELS: Record<string, string> = {
  button: 'btn', switch: 'sw', slider: 'slider', knob: 'knob', folder: 'folder',
}

export const SLIDER_ACTION_TYPES = ['volume', 'scroll', 'hotkey', 'command', 'sequence', 'plugin'] as const
export const SWITCH_ACTION_TYPES = ['builtin', 'hotkey', 'command', 'sequence', 'page', 'plugin'] as const

export const SOLID_SWATCHES: string[] = [
  '#0f172a','#1e293b','#334155','#475569',
  '#1e3a5f','#1e40af','#2563eb','#3b82f6',
  '#312e81','#4338ca','#4f46e5','#818cf8',
  '#581c87','#7e22ce','#9333ea','#c084fc',
  '#9d174d','#ec4899','#f472b6','#fda4af',
  '#7f1d1d','#dc2626','#f87171','#fca5a5',
  '#7c2d12','#ea580c','#fb923c','#fdba74',
  '#854d0e','#eab308','#fbbf24','#fde68a',
  '#14532d','#22c55e','#4ade80','#bbf7d0',
  '#134e4a','#14b8a6','#2dd4bf','#99f6e4',
]

export interface GradientSwatch { label: string; value: string }

export const GRADIENT_SWATCHES: GradientSwatch[] = [
  { label: 'Ocean',  value: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)' },
  { label: 'Purple', value: 'linear-gradient(135deg,#2d1b69,#11998e)' },
  { label: 'Sunset', value: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  { label: 'Fire',   value: 'linear-gradient(135deg,#f12711,#f5af19)' },
  { label: 'Aurora', value: 'linear-gradient(135deg,#00b4db,#0083b0)' },
  { label: 'Neon',   value: 'linear-gradient(135deg,#08f7fe,#09b1e3,#7c3aed)' },
  { label: 'Forest', value: 'linear-gradient(135deg,#134e4a,#22c55e)' },
  { label: 'Candy',  value: 'linear-gradient(135deg,#f472b6,#818cf8)' },
  { label: 'Gold',   value: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { label: 'Dark',   value: 'linear-gradient(135deg,#0f172a,#1e293b)' },
]

export const ACTIVE_SWATCHES: string[] = [
  '#4f46e5','#7c3aed','#2563eb','#0891b2',
  '#16a34a','#dc2626','#d97706','#ec4899','#f87171','#4ade80',
]

export const EMOJI_DATA: Record<string, string[]> = {
  smileys:  ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😔','😟','😕','🙁','😢','😭','😤','😠','😡','🤬'],
  gestures: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','💪','👏','🙌','🤲','🙏','✍️','💅','🫶','🫵','🤳'],
  nature:   ['🌱','🌿','☘️','🍀','🌸','🌺','🌻','🌹','🌷','💐','🍁','🍂','🍃','🌲','🌳','🌴','🌵','🍄','🌾','🌊','🌋','🏔️','🌙','☀️','🌤️','⛅','🌈','❄️','⚡','🌪️','🔥','💧','🌍'],
  objects:  ['💡','🔦','🖥️','💻','⌨️','🖱️','📱','📷','🎮','🕹️','🎧','🎤','📻','📺','⏰','🔑','🗝️','🔒','🔓','🔨','⚙️','🔧','🔩','💊','📚','📖','✏️','📝','📌','📎','📐','📏','🎁','🏆','🥇','🎭','🎨'],
  symbols:  ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','✨','💫','🎉','🎊','🎈','🎯','✅','❌','⚠️','🔔','🔕','📢','💬','💭','🔴','🟠','🟡','🟢','🔵','🟣'],
  tech:     ['💻','🖥️','⌨️','🖱️','🖨️','📱','📲','☎️','📞','🔋','🔌','💾','💿','📀','📡','⚡','🔭','🔬','🧲','💡','🛠️','⚙️','🔧','🔨','🧰','🧪'],
  gaming:   ['🎮','🕹️','👾','🎲','🎯','🎳','♟️','🃏','🀄','🎴','🧩','🎰','🏆','🥇','🥈','🥉','🎭','🎪','🎠','🎡','🎢','🎟️'],
  media:    ['▶️','⏸️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','🔀','🔁','🔂','🔊','🔉','🔈','🔇','📢','📣','🔔','🎵','🎶','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎬','🎥','📽️'],
}
export const ALL_EMOJIS: string[] = [...new Set(Object.values(EMOJI_DATA).flat())]
