const selfsigned = require('selfsigned')
const os  = require('os')
const fs  = require('fs')
const path = require('path')

const CERT_DIR  = path.join(__dirname, '../../.cert')
const KEY_FILE  = path.join(CERT_DIR, 'key.pem')
const CERT_FILE = path.join(CERT_DIR, 'cert.pem')
const IP_FILE   = path.join(CERT_DIR, 'ip.txt')

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function generateCert() {
  const ip = getLocalIP()

  // Reuse saved cert if IP hasn't changed
  try {
    if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
      const savedIP = fs.existsSync(IP_FILE) ? fs.readFileSync(IP_FILE, 'utf8').trim() : null
      if (savedIP === ip) {
        return {
          key:  fs.readFileSync(KEY_FILE, 'utf8'),
          cert: fs.readFileSync(CERT_FILE, 'utf8'),
          ip
        }
      }
    }
  } catch {}

  // Generate new cert and persist it
  const pems = selfsigned.generate([{ name: 'commonName', value: ip }], {
    days: 3650,
    keySize: 2048,
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 7, ip },
        { type: 2, value: 'localhost' }
      ]
    }]
  })

  fs.mkdirSync(CERT_DIR, { recursive: true })
  fs.writeFileSync(KEY_FILE,  pems.private)
  fs.writeFileSync(CERT_FILE, pems.cert)
  fs.writeFileSync(IP_FILE,   ip)

  return { key: pems.private, cert: pems.cert, ip }
}

module.exports = { generateCert, getLocalIP }
