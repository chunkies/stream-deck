const { execSync } = require('child_process')

function executeCommand(command) {
  if (!command || !command.trim()) return
  try {
    execSync(command, { timeout: 2000 })
  } catch (err) {
    console.error('Command failed:', command, err.message)
  }
}

function executeMouseMove(x, y) {
  try { execSync(`xdotool mousemove ${x} ${y}`, { timeout: 50 }) } catch {}
}

module.exports = { executeCommand, executeMouseMove }
