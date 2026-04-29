import os   from 'os'
import fs   from 'fs'
import path from 'path'

const selfsigned = require('selfsigned') as { generate: (attrs: object[], opts: object) => { private: string; cert: string } }

interface CertPair { cert: string; key: string }

export function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const ifaces of Object.values(interfaces)) {
    if (!ifaces) continue
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function selfSignedCert(certDir: string, ip: string): CertPair {
  const KEY_FILE  = path.join(certDir, 'key.pem')
  const CERT_FILE = path.join(certDir, 'cert.pem')
  const IP_FILE   = path.join(certDir, 'ip.txt')

  try {
    if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
      const savedIP = fs.existsSync(IP_FILE) ? fs.readFileSync(IP_FILE, 'utf8').trim() : null
      if (savedIP === ip) {
        return { key: fs.readFileSync(KEY_FILE, 'utf8'), cert: fs.readFileSync(CERT_FILE, 'utf8') }
      }
    }
  } catch {}

  const pems = selfsigned.generate([{ name: 'commonName', value: ip }], {
    days: 3650, keySize: 2048,
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip }, { type: 2, value: 'localhost' }] }]
  })

  fs.mkdirSync(certDir, { recursive: true })
  fs.writeFileSync(KEY_FILE,  pems.private)
  fs.writeFileSync(CERT_FILE, pems.cert)
  fs.writeFileSync(IP_FILE,   ip)

  return { key: pems.private, cert: pems.cert }
}

export async function getCert(certDir: string): Promise<CertPair & { ip: string; host: string; mode: string }> {
  fs.mkdirSync(certDir, { recursive: true })
  const ip = getLocalIP()
  const { key, cert } = selfSignedCert(certDir, ip)
  return { key, cert, ip, host: ip, mode: 'self-signed' }
}
