import https from 'https'
import os    from 'os'
import fs    from 'fs'
import path  from 'path'

// selfsigned has no @types package
// eslint-disable-next-line @typescript-eslint/no-require-imports
const selfsigned = require('selfsigned') as { generate: (attrs: object[], opts: object) => { private: string; cert: string } }

interface CertPair { cert: string; key: string }

function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const ifaces of Object.values(interfaces)) {
    if (!ifaces) continue
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, res => {
      let data = ''
      res.on('data', (d: Buffer) => { data += d })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// traefik.me is a free service that provides a shared wildcard cert for *.traefik.me.
// Their DNS resolves 192-168-1-5.traefik.me → 192.168.1.5 automatically.
// Browsers trust the cert without any manual install step on the phone.
// The private key is intentionally public (shared dev cert) — acceptable for a LAN macro pad.
async function getTraefikCert(certDir: string): Promise<CertPair> {
  const certFile = path.join(certDir, 'traefik-fullchain.pem')
  const keyFile  = path.join(certDir, 'traefik-privkey.pem')
  const metaFile = path.join(certDir, 'traefik-meta.json')

  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { fetchedAt: number }
    if (Date.now() - meta.fetchedAt < 25 * 24 * 60 * 60 * 1000) {
      return {
        cert: fs.readFileSync(certFile, 'utf8'),
        key:  fs.readFileSync(keyFile,  'utf8')
      }
    }
  } catch {}

  const [cert, key] = await Promise.all([
    fetchText('https://traefik.me/fullchain.pem'),
    fetchText('https://traefik.me/privkey.pem')
  ])

  if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('BEGIN')) {
    throw new Error('Invalid cert from traefik.me')
  }

  fs.mkdirSync(certDir, { recursive: true })
  fs.writeFileSync(certFile, cert)
  fs.writeFileSync(keyFile,  key)
  fs.writeFileSync(metaFile, JSON.stringify({ fetchedAt: Date.now() }))

  return { cert, key }
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

// Returns { key, cert, ip, host, mode }
// host = hostname to use in URLs — traefik.me encoded IP when online, raw IP as fallback
export async function getCert(certDir: string): Promise<CertPair & { ip: string; host: string; mode: string }> {
  fs.mkdirSync(certDir, { recursive: true })
  const ip = getLocalIP()

  try {
    const { cert, key } = await getTraefikCert(certDir)
    return { key, cert, ip, host: ip.replace(/\./g, '-') + '.traefik.me', mode: 'traefik' }
  } catch (err) {
    console.warn('traefik.me unavailable, falling back to self-signed:', (err as Error).message)
    const { key, cert } = selfSignedCert(certDir, ip)
    return { key, cert, ip, host: ip, mode: 'self-signed' }
  }
}

export { getLocalIP }
