'use strict'

module.exports = (sdk) => ({

  // Uses sdk.shell.execAsync — async shell output
  'system-info.cpu': async () => {
    const raw = await sdk.shell.execAsync("grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$3+$4+$5)} END {printf \"%.1f\", usage}'")
    const msg = `CPU: ${raw.trim()}%`
    sdk.log.info(msg)
    await sdk.shell.execAsync(`notify-send "System Info" "${msg}" 2>/dev/null || true`)
    sdk.broadcast({ event: 'sysInfo', key: 'cpu', value: raw.trim() })
  },

  // Uses sdk.shell.exec — sync, reads /proc/meminfo
  'system-info.memory': () => {
    const raw    = sdk.shell.exec('cat /proc/meminfo')
    const total  = parseInt(raw.match(/MemTotal:\s+(\d+)/)?.[1] || '0')
    const avail  = parseInt(raw.match(/MemAvailable:\s+(\d+)/)?.[1] || '0')
    const usedPct = total ? Math.round(((total - avail) / total) * 100) : 0
    const msg = `RAM: ${usedPct}% used (${Math.round(avail / 1024)}MB free)`
    sdk.log.info(msg)
    sdk.shell.exec(`notify-send "System Info" "${msg}" 2>/dev/null || true`)
    sdk.broadcast({ event: 'sysInfo', key: 'memory', value: usedPct })
  },

  // Uses sdk.shell.execAsync — uptime
  'system-info.uptime': async () => {
    const raw = await sdk.shell.execAsync('uptime -p')
    const msg = `Uptime: ${raw.trim()}`
    sdk.log.info(msg)
    await sdk.shell.execAsync(`notify-send "System Info" "${msg}" 2>/dev/null || true`)
  },

  // Uses sdk.http.get — external API call
  'system-info.ip': async () => {
    try {
      const data = await sdk.http.get('https://api.ipify.org?format=json')
      const msg = `Public IP: ${data.ip}`
      sdk.log.info(msg)
      await sdk.shell.execAsync(`notify-send "System Info" "${msg}" 2>/dev/null || true`)
    } catch (err) {
      sdk.log.error('IP lookup failed: ' + err.message)
    }
  },

  // Uses sdk.storage — persistent counter across button presses
  'system-info.count': async () => {
    const count = (sdk.storage.get('pressCount') || 0) + 1
    sdk.storage.set('pressCount', count)
    const msg = `Pressed ${count} time${count === 1 ? '' : 's'}`
    sdk.log.info(msg)
    await sdk.shell.execAsync(`notify-send "System Info" "${msg}" 2>/dev/null || true`)
  }

})
