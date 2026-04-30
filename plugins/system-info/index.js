'use strict'

const os = require('os')

module.exports = (sdk) => {
  const platform = os.platform() // 'linux' | 'darwin' | 'win32'

  // ── Shell helpers ──────────────────────────────────────────────────────

  // Returns null on error instead of throwing, so poll never crashes.
  async function tryExec(cmd) {
    try {
      return await sdk.shell.execAsync(cmd, { timeout: 8000 })
    } catch {
      return null
    }
  }

  // ── CPU ────────────────────────────────────────────────────────────────

  // Linux: /proc/stat gives cumulative jiffies — compute delta between two reads 0.2s apart.
  // macOS: `top -l 2 -s 1 -n 0` — second sample is accurate.
  // Windows: `wmic cpu get loadpercentage /value` → LoadPercentage=NN

  let prevCpuTotal = 0
  let prevCpuIdle  = 0

  async function getCpuPercent() {
    if (platform === 'linux') {
      const line = await tryExec("grep '^cpu ' /proc/stat")
      if (!line) return null
      const nums  = line.trim().split(/\s+/).slice(1).map(Number)
      const idle  = nums[3] || 0
      const total = nums.reduce((a, b) => a + b, 0)
      const dTotal = total - prevCpuTotal
      const dIdle  = idle  - prevCpuIdle
      prevCpuTotal = total
      prevCpuIdle  = idle
      if (dTotal === 0) return null
      return (((dTotal - dIdle) / dTotal) * 100).toFixed(1)
    }

    if (platform === 'darwin') {
      // top -l 2: first sample is from boot, second is a 1-s delta — grab the second
      const out = await tryExec('top -l 2 -s 1 -n 0 | grep -E "^CPU usage" | tail -1')
      if (!out) return null
      const m = out.match(/([\d.]+)%\s+user.*?([\d.]+)%\s+sys/)
      if (!m) return null
      return (parseFloat(m[1]) + parseFloat(m[2])).toFixed(1)
    }

    if (platform === 'win32') {
      const out = await tryExec('wmic cpu get loadpercentage /value')
      if (!out) return null
      const m = out.match(/LoadPercentage=(\d+)/)
      return m ? m[1] : null
    }

    return null
  }

  // ── Memory ─────────────────────────────────────────────────────────────

  async function getMemoryInfo() {
    if (platform === 'linux') {
      const out = await tryExec('cat /proc/meminfo')
      if (!out) return null
      const total = parseInt(out.match(/MemTotal:\s+(\d+)/)?.[1] || '0')
      const avail = parseInt(out.match(/MemAvailable:\s+(\d+)/)?.[1] || '0')
      if (!total) return null
      const usedMB  = Math.round((total - avail) / 1024)
      const totalMB = Math.round(total / 1024)
      const pct     = Math.round(((total - avail) / total) * 100)
      return { used: usedMB, total: totalMB, pct, text: `${usedMB}/${totalMB}MB (${pct}%)` }
    }

    if (platform === 'darwin') {
      // vm_stat gives pages; pagesize is typically 4096 on Apple Silicon and x86
      const [vmOut, hwOut] = await Promise.all([
        tryExec('vm_stat'),
        tryExec('sysctl hw.memsize')
      ])
      if (!vmOut || !hwOut) return null
      const pageSize  = 4096
      const totalBytes = parseInt(hwOut.match(/hw\.memsize:\s*(\d+)/)?.[1] || '0')
      const free      = parseInt(vmOut.match(/Pages free:\s+(\d+)/)?.[1] || '0') * pageSize
      const inactive  = parseInt(vmOut.match(/Pages inactive:\s+(\d+)/)?.[1] || '0') * pageSize
      const wired     = parseInt(vmOut.match(/Pages wired down:\s+(\d+)/)?.[1] || '0') * pageSize
      const active    = parseInt(vmOut.match(/Pages active:\s+(\d+)/)?.[1] || '0') * pageSize
      const used      = wired + active
      const totalMB   = Math.round(totalBytes / 1024 / 1024)
      const usedMB    = Math.round(used / 1024 / 1024)
      const pct       = totalBytes ? Math.round((used / totalBytes) * 100) : 0
      return { used: usedMB, total: totalMB, pct, text: `${usedMB}/${totalMB}MB (${pct}%)` }
    }

    if (platform === 'win32') {
      const out = await tryExec('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value')
      if (!out) return null
      const free  = parseInt(out.match(/FreePhysicalMemory=(\d+)/)?.[1] || '0')
      const total = parseInt(out.match(/TotalVisibleMemorySize=(\d+)/)?.[1] || '0')
      if (!total) return null
      const usedMB  = Math.round((total - free) / 1024)
      const totalMB = Math.round(total / 1024)
      const pct     = Math.round(((total - free) / total) * 100)
      return { used: usedMB, total: totalMB, pct, text: `${usedMB}/${totalMB}MB (${pct}%)` }
    }

    return null
  }

  // ── Disk ───────────────────────────────────────────────────────────────

  async function getDiskInfo() {
    if (platform === 'linux' || platform === 'darwin') {
      const out = await tryExec("df -h / | awk 'NR==2{print $3\"/\"$2\" (\"$5\")\"}'")
      if (!out) return null
      return { text: out.trim() }
    }

    if (platform === 'win32') {
      // Returns one row per volume; use C: (first match)
      const out = await tryExec('wmic logicaldisk where "DeviceID=\'C:\'" get freespace,size /value')
      if (!out) return null
      const free  = parseInt(out.match(/FreeSpace=(\d+)/)?.[1] || '0')
      const size  = parseInt(out.match(/Size=(\d+)/)?.[1] || '0')
      if (!size) return null
      const usedGB  = ((size - free) / 1e9).toFixed(1)
      const totalGB = (size / 1e9).toFixed(1)
      const pct     = Math.round(((size - free) / size) * 100)
      return { text: `${usedGB}/${totalGB}GB (${pct}%)` }
    }

    return null
  }

  // ── Network ────────────────────────────────────────────────────────────
  // Linux: read /proc/net/dev twice 1s apart, compute bytes/s for all non-loopback interfaces.
  // macOS / Windows: best-effort via netstat / wmic.

  let prevNetRx = 0
  let prevNetTx = 0
  let prevNetTime = 0

  async function parseLinuxNetDev() {
    const out = await tryExec('cat /proc/net/dev')
    if (!out) return null
    let rx = 0, tx = 0
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/)
      // Format: iface: rxBytes ... txBytes ...
      if (!parts[0] || parts[0] === 'Inter-|' || parts[0] === 'face' || parts[0].startsWith('lo:')) continue
      if (!parts[0].endsWith(':')) continue
      rx += parseInt(parts[1]) || 0
      tx += parseInt(parts[9]) || 0
    }
    return { rx, tx }
  }

  async function getNetworkInfo() {
    if (platform === 'linux') {
      const now  = Date.now()
      const snap = await parseLinuxNetDev()
      if (!snap) return null

      const dt  = (now - prevNetTime) / 1000 || 1  // seconds
      const rxS = prevNetTime ? ((snap.rx - prevNetRx) / dt) : 0
      const txS = prevNetTime ? ((snap.tx - prevNetTx) / dt) : 0

      prevNetRx   = snap.rx
      prevNetTx   = snap.tx
      prevNetTime = now

      const fmt = (bps) => {
        if (bps > 1e6)  return `${(bps / 1e6).toFixed(1)}MB/s`
        if (bps > 1e3)  return `${(bps / 1e3).toFixed(0)}KB/s`
        return `${Math.round(bps)}B/s`
      }
      return { rxPerSec: Math.max(0, rxS), txPerSec: Math.max(0, txS), text: `↓${fmt(Math.max(0, rxS))} ↑${fmt(Math.max(0, txS))}` }
    }

    if (platform === 'darwin') {
      // netstat -i gives cumulative packet/byte counts per interface; good-enough summary
      const out = await tryExec("netstat -ib | awk 'NR>1 && $1!~/^lo/{rx+=$7; tx+=$10} END{print rx\" \"tx}'")
      if (!out) return null
      const [rx, tx] = out.trim().split(' ').map(Number)
      return { text: `Rx:${(rx/1e6).toFixed(0)}MB Tx:${(tx/1e6).toFixed(0)}MB (total)` }
    }

    if (platform === 'win32') {
      const out = await tryExec('wmic path win32_perfformatteddata_tcpip_networkinterface get BytesReceivedPersec,BytesSentPersec /value')
      if (!out) return null
      const rx = parseInt(out.match(/BytesReceivedPersec=(\d+)/)?.[1] || '0')
      const tx = parseInt(out.match(/BytesSentPersec=(\d+)/)?.[1] || '0')
      const fmt = (bps) => bps > 1e6 ? `${(bps / 1e6).toFixed(1)}MB/s` : `${(bps / 1e3).toFixed(0)}KB/s`
      return { rxPerSec: rx, txPerSec: tx, text: `↓${fmt(rx)} ↑${fmt(tx)}` }
    }

    return null
  }

  // ── Broadcast helper ───────────────────────────────────────────────────

  function broadcastStat(key, value, text) {
    sdk.broadcast('sysInfo', { key, value, text: text || String(value) })
  }

  // ── Periodic poll every 5s ─────────────────────────────────────────────
  sdk.cron(5000, async () => {
    try {
      const [cpu, mem, disk, net] = await Promise.all([
        getCpuPercent(),
        getMemoryInfo(),
        getDiskInfo(),
        getNetworkInfo()
      ])

      if (cpu  !== null) broadcastStat('cpu',     cpu,          `CPU: ${cpu}%`)
      if (mem  !== null) broadcastStat('memory',  mem.pct,      `RAM: ${mem.text}`)
      if (disk !== null) broadcastStat('disk',    disk.text,    `Disk: ${disk.text}`)
      if (net  !== null) broadcastStat('network', net.text,     `Net: ${net.text}`)
    } catch (err) {
      sdk.log.error('Poll error:', err.message)
    }
  })

  // ── On-demand action handlers ──────────────────────────────────────────

  sdk.on('system-info.getCpu', async () => {
    try {
      const cpu = await getCpuPercent()
      if (cpu === null) { sdk.log.warn('getCpu: no data'); return }
      broadcastStat('cpu', cpu, `CPU: ${cpu}%`)
      sdk.log.info(`CPU: ${cpu}%`)
    } catch (err) {
      sdk.log.error('getCpu action failed:', err.message)
    }
  })

  sdk.on('system-info.getMemory', async () => {
    try {
      const mem = await getMemoryInfo()
      if (!mem) { sdk.log.warn('getMemory: no data'); return }
      broadcastStat('memory', mem.pct, `RAM: ${mem.text}`)
      sdk.log.info(`Memory: ${mem.text}`)
    } catch (err) {
      sdk.log.error('getMemory action failed:', err.message)
    }
  })

  sdk.on('system-info.getDisk', async () => {
    try {
      const disk = await getDiskInfo()
      if (!disk) { sdk.log.warn('getDisk: no data'); return }
      broadcastStat('disk', disk.text, `Disk: ${disk.text}`)
      sdk.log.info(`Disk: ${disk.text}`)
    } catch (err) {
      sdk.log.error('getDisk action failed:', err.message)
    }
  })

  sdk.on('system-info.getNetwork', async () => {
    try {
      const net = await getNetworkInfo()
      if (!net) { sdk.log.warn('getNetwork: no data'); return }
      broadcastStat('network', net.text, `Net: ${net.text}`)
      sdk.log.info(`Network: ${net.text}`)
    } catch (err) {
      sdk.log.error('getNetwork action failed:', err.message)
    }
  })
}
