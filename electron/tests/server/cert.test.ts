import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import os   from 'os'
import fs   from 'fs'
import path from 'path'

const _require = createRequire(__filename)

const { getLocalIP, getCert } = _require('../../../dist/electron/server/cert')

// ── getLocalIP ─────────────────────────────────────────
describe('getLocalIP', () => {
  test('returns a valid IPv4 address string', () => {
    const ip = getLocalIP()
    expect(typeof ip).toBe('string')
    expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
  })

  test('falls back to 127.0.0.1 when no external interfaces found', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({})
    const ip = getLocalIP()
    expect(ip).toBe('127.0.0.1')
    vi.restoreAllMocks()
  })

  test('skips loopback interfaces', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true, netmask: '', mac: '', cidr: null }],
      eth0: [{ family: 'IPv4', address: '192.168.1.5', internal: false, netmask: '', mac: '', cidr: null }],
    })
    const ip = getLocalIP()
    expect(ip).toBe('192.168.1.5')
    vi.restoreAllMocks()
  })

  test('skips IPv6 interfaces', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      eth0: [
        { family: 'IPv6', address: '::1',      internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 },
        { family: 'IPv4', address: '10.0.0.2', internal: false, netmask: '', mac: '', cidr: null },
      ],
    })
    const ip = getLocalIP()
    expect(ip).toBe('10.0.0.2')
    vi.restoreAllMocks()
  })
})

// ── getCert ────────────────────────────────────────────
describe('getCert', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-test-')) })
  afterEach(()  => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  test('returns cert, key, ip, host, mode', async () => {
    const result = await getCert(tmpDir)
    expect(result.cert).toMatch(/-----BEGIN CERTIFICATE-----/)
    expect(result.key).toMatch(/-----BEGIN/)
    expect(result.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    expect(result.host).toBe(result.ip)
    expect(result.mode).toBe('self-signed')
  })

  test('writes cert.pem, key.pem, and ip.txt to certDir', async () => {
    await getCert(tmpDir)
    expect(fs.existsSync(path.join(tmpDir, 'cert.pem'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'key.pem'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'ip.txt'))).toBe(true)
  })

  test('reuses cached cert on second call with same IP', async () => {
    const first  = await getCert(tmpDir)
    const second = await getCert(tmpDir)
    expect(second.cert).toBe(first.cert)
    expect(second.key).toBe(first.key)
  })

  test('regenerates cert when cached IP differs from current IP', async () => {
    const first = await getCert(tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'ip.txt'), '1.2.3.4')
    const second = await getCert(tmpDir)
    // Cert is regenerated — content differs
    expect(second.cert).not.toBe(first.cert)
  })

  test('creates certDir recursively if it does not exist', async () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'cert')
    const result = await getCert(nested)
    expect(fs.existsSync(nested)).toBe(true)
    expect(result.cert).toMatch(/-----BEGIN CERTIFICATE-----/)
  })

  test('ip.txt content matches the IP returned', async () => {
    const result = await getCert(tmpDir)
    const stored = fs.readFileSync(path.join(tmpDir, 'ip.txt'), 'utf8').trim()
    expect(stored).toBe(result.ip)
  })

  test('cert uses SHA-256 signature algorithm (not SHA-1)', async () => {
    // Mobile browsers (Chrome, Firefox on Android/iOS) reject SHA-1 signed certs.
    // This test ensures we always generate SHA-256 certs.
    const { execSync } = _require('child_process') as typeof import('child_process')
    await getCert(tmpDir)
    const certFile = path.join(tmpDir, 'cert.pem')
    const text     = execSync(`openssl x509 -noout -text -in "${certFile}"`).toString()
    expect(text).toMatch(/sha256WithRSAEncryption/)
    expect(text).not.toMatch(/sha1WithRSAEncryption/)
  })

  test('cert SAN includes the local IP address', async () => {
    // Browsers require a Subject Alternative Name matching the IP — CN alone is not enough.
    const { execSync } = _require('child_process') as typeof import('child_process')
    const result   = await getCert(tmpDir)
    const certFile = path.join(tmpDir, 'cert.pem')
    const text     = execSync(`openssl x509 -noout -text -in "${certFile}"`).toString()
    expect(text).toContain(`IP Address:${result.ip}`)
  })
})
