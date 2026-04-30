'use strict'

const os = require('os')

/**
 * Audio Switcher plugin — list and switch audio I/O devices.
 *
 * Platform support:
 *   Linux   — uses pactl (PulseAudio / PipeWire-pulse)
 *   macOS   — uses SwitchAudioSource CLI (brew install switchaudio-osx)
 *   Windows — not supported; logs a warning and returns early on every action
 *
 * Device matching is done by partial, case-insensitive string match so the
 * user doesn't have to type the exact sink/source name.
 */
module.exports = (sdk) => {
  const platform = os.platform()  // 'linux' | 'darwin' | 'win32'

  // -------------------------------------------------------------------------
  // Platform guard
  // -------------------------------------------------------------------------

  if (platform === 'win32') {
    sdk.log.warn('Audio Switcher: Windows not yet supported')
    // Register no-op handlers so the plugin loads without errors
    const noop = () => { sdk.log.warn('Audio Switcher: Windows not yet supported') }
    sdk.on('audio-switcher.listOutputs', noop)
    sdk.on('audio-switcher.listInputs',  noop)
    sdk.on('audio-switcher.setOutput',   noop)
    sdk.on('audio-switcher.setInput',    noop)
    sdk.on('audio-switcher.getDefault',  noop)
    return
  }

  // -------------------------------------------------------------------------
  // Platform-specific helpers
  // -------------------------------------------------------------------------

  /**
   * Parse `pactl list short sinks` output into an array of sink name strings.
   * Each line is tab-separated: index \t name \t driver \t sample \t state
   */
  function parsePactlShort(raw) {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split('\t')[1])
      .filter(Boolean)
  }

  /**
   * Parse `SwitchAudioSource -a -t output` or `-t input` output.
   * Each line is just a device name.
   */
  function parseSwitchAudio(raw) {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }

  /** List audio output (sink/speaker) devices. Returns string[]. */
  async function listOutputDevices() {
    if (platform === 'linux') {
      const raw = await sdk.shell.execAsync('pactl list short sinks')
      return parsePactlShort(raw)
    }
    // macOS
    const raw = await sdk.shell.execAsync('SwitchAudioSource -a -t output')
    return parseSwitchAudio(raw)
  }

  /** List audio input (source/microphone) devices. Returns string[]. */
  async function listInputDevices() {
    if (platform === 'linux') {
      // Exclude monitor sources (loopback of sinks) — they start with the sink name + ".monitor"
      const raw = await sdk.shell.execAsync('pactl list short sources')
      return parsePactlShort(raw).filter(name => !name.endsWith('.monitor'))
    }
    // macOS
    const raw = await sdk.shell.execAsync('SwitchAudioSource -a -t input')
    return parseSwitchAudio(raw)
  }

  /**
   * Find the first device from `devices` whose name contains `query`
   * (case-insensitive). Returns undefined if nothing matched.
   */
  function matchDevice(devices, query) {
    const q = query.toLowerCase()
    return devices.find(d => d.toLowerCase().includes(q))
  }

  /** Get the current default output device name. */
  async function getDefaultOutput() {
    if (platform === 'linux') {
      // `pactl get-default-sink` returns just the sink name
      return sdk.shell.execAsync('pactl get-default-sink')
    }
    return sdk.shell.execAsync('SwitchAudioSource -c -t output')
  }

  /** Get the current default input device name. */
  async function getDefaultInput() {
    if (platform === 'linux') {
      return sdk.shell.execAsync('pactl get-default-source')
    }
    return sdk.shell.execAsync('SwitchAudioSource -c -t input')
  }

  /** Switch default output to `deviceName` (exact name). */
  async function setDefaultOutput(deviceName) {
    if (platform === 'linux') {
      await sdk.shell.execAsync(`pactl set-default-sink ${JSON.stringify(deviceName)}`)
    } else {
      await sdk.shell.execAsync(`SwitchAudioSource -s ${JSON.stringify(deviceName)} -t output`)
    }
  }

  /** Switch default input to `deviceName` (exact name). */
  async function setDefaultInput(deviceName) {
    if (platform === 'linux') {
      await sdk.shell.execAsync(`pactl set-default-source ${JSON.stringify(deviceName)}`)
    } else {
      await sdk.shell.execAsync(`SwitchAudioSource -s ${JSON.stringify(deviceName)} -t input`)
    }
  }

  // -------------------------------------------------------------------------
  // Broadcast helpers
  // -------------------------------------------------------------------------

  /** Broadcast the current default input + output device names. */
  async function broadcastCurrent() {
    try {
      const [output, input] = await Promise.all([getDefaultOutput(), getDefaultInput()])
      sdk.broadcast('current', { output, input })
    } catch (err) {
      sdk.log.error('Audio Switcher: failed to get current defaults:', err.message)
      sdk.broadcast('current', { error: err.message })
    }
  }

  // -------------------------------------------------------------------------
  // 10-second polling cron
  // -------------------------------------------------------------------------

  sdk.cron(10000, () => {
    broadcastCurrent().catch(err => {
      sdk.log.error('Audio Switcher cron error:', err.message)
    })
  })

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  /**
   * audio-switcher.listOutputs
   * Fetches available output devices and broadcasts { devices: string[] }.
   */
  sdk.on('audio-switcher.listOutputs', async () => {
    try {
      const devices = await listOutputDevices()
      sdk.log.info('Output devices:', devices)
      sdk.broadcast('outputs', { devices })
    } catch (err) {
      sdk.log.error('audio-switcher.listOutputs error:', err.message)
      sdk.broadcast('outputs', { error: err.message })
    }
  })

  /**
   * audio-switcher.listInputs
   * Fetches available input devices and broadcasts { devices: string[] }.
   */
  sdk.on('audio-switcher.listInputs', async () => {
    try {
      const devices = await listInputDevices()
      sdk.log.info('Input devices:', devices)
      sdk.broadcast('inputs', { devices })
    } catch (err) {
      sdk.log.error('audio-switcher.listInputs error:', err.message)
      sdk.broadcast('inputs', { error: err.message })
    }
  })

  /**
   * audio-switcher.setOutput
   * Params: { device: string } — partial device name, case-insensitive.
   * Finds the first matching output device and switches to it.
   * Broadcasts { active: deviceName } on success or { error } on failure.
   */
  sdk.on('audio-switcher.setOutput', async (params) => {
    const query = (params && params.device) ? String(params.device).trim() : ''
    if (!query) {
      sdk.log.warn('audio-switcher.setOutput: no device param provided')
      sdk.broadcast('outputChanged', { error: 'No device name provided' })
      return
    }

    try {
      const devices = await listOutputDevices()
      const match   = matchDevice(devices, query)

      if (!match) {
        const msg = `No output device matching "${query}". Available: ${devices.join(', ')}`
        sdk.log.warn('audio-switcher.setOutput:', msg)
        sdk.broadcast('outputChanged', { error: msg })
        return
      }

      await setDefaultOutput(match)
      sdk.log.info(`Output switched to: ${match}`)
      sdk.broadcast('outputChanged', { active: match })
    } catch (err) {
      sdk.log.error('audio-switcher.setOutput error:', err.message)
      sdk.broadcast('outputChanged', { error: err.message })
    }
  })

  /**
   * audio-switcher.setInput
   * Params: { device: string } — partial device name, case-insensitive.
   * Finds the first matching input device and switches to it.
   * Broadcasts { active: deviceName } on success or { error } on failure.
   */
  sdk.on('audio-switcher.setInput', async (params) => {
    const query = (params && params.device) ? String(params.device).trim() : ''
    if (!query) {
      sdk.log.warn('audio-switcher.setInput: no device param provided')
      sdk.broadcast('inputChanged', { error: 'No device name provided' })
      return
    }

    try {
      const devices = await listInputDevices()
      const match   = matchDevice(devices, query)

      if (!match) {
        const msg = `No input device matching "${query}". Available: ${devices.join(', ')}`
        sdk.log.warn('audio-switcher.setInput:', msg)
        sdk.broadcast('inputChanged', { error: msg })
        return
      }

      await setDefaultInput(match)
      sdk.log.info(`Input switched to: ${match}`)
      sdk.broadcast('inputChanged', { active: match })
    } catch (err) {
      sdk.log.error('audio-switcher.setInput error:', err.message)
      sdk.broadcast('inputChanged', { error: err.message })
    }
  })

  /**
   * audio-switcher.getDefault
   * Broadcasts { input, output } with the current default device names.
   */
  sdk.on('audio-switcher.getDefault', async () => {
    await broadcastCurrent()
  })

  // Emit an initial poll so clients connecting right after load are in sync
  broadcastCurrent().catch(err => {
    sdk.log.warn('Audio Switcher: initial poll failed:', err.message)
  })
}
