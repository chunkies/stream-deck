'use strict'

const PLATFORMS = Object.freeze({
  LINUX:   'linux',
  DARWIN:  'darwin',
  WINDOWS: 'win32'
})

const ACTION_TYPES = Object.freeze({
  BUILTIN:  'builtin',
  COMMAND:  'command',
  HOTKEY:   'hotkey',
  TOGGLE:   'toggle',
  SEQUENCE: 'sequence',
  PAGE:     'page',
  PLUGIN:   'plugin',
  VOLUME:   'volume',
  SCROLL:   'scroll'
})

const COMPONENT_TYPES = Object.freeze({
  BUTTON:  'button',
  SWITCH:  'switch',
  SLIDER:  'slider',
  KNOB:    'knob',
  TILE:    'tile',
  SPOTIFY: 'spotify',
  VOICE:   'voice'
})

const MESSAGE_TYPES = Object.freeze({
  CONFIG:          'config',
  PRESS:           'press',
  SLIDE:           'slide',
  VOICE_COMMAND:   'voiceCommand',
  TOGGLE_STATE:    'toggleState',
  NAVIGATE:        'navigate',
  TILE_UPDATE:     'tileUpdate',
  SPOTIFY_UPDATE:  'spotifyUpdate',
  PLUGINS_RELOAD:  'pluginsReloaded',
  VOICE_RESULT:    'voiceResult',
  CONNECTION:      'connection'
})

const TIMINGS = Object.freeze({
  PLUGIN_TIMEOUT_MS:   10_000,
  TILE_POLL_MIN_MS:     1_000,
  TILE_POLL_CMD_MS:     3_000,
  SPOTIFY_POLL_MS:      2_000,
  SPOTIFY_ART_FETCH_MS: 4_000,
  COMMAND_TIMEOUT_MS:   5_000,
  SEQUENCE_DEFAULT_MS:    150
})

module.exports = { PLATFORMS, ACTION_TYPES, COMPONENT_TYPES, MESSAGE_TYPES, TIMINGS }
