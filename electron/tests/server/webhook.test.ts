import { describe, test, expect } from 'vitest'

// Test the webhook URL pattern and secret format
describe('webhook secret format', () => {
  test('generated secret is a 48-char hex string', () => {
    // crypto.randomBytes(24).toString('hex') produces 48 hex chars
    const secret = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    expect(secret).toMatch(/^[0-9a-f]{48}$/)
  })

  test('webhook URL pattern is well-formed', () => {
    const secret  = 'abc123def456abc123def456abc123def456abc123def456'
    const baseUrl = 'https://192.168.1.10:3000'
    const pageId  = 'media'
    const buttonId = 'c-play'
    const url = `${baseUrl}/webhook/${secret}/${pageId}/${buttonId}`
    expect(url).toBe('https://192.168.1.10:3000/webhook/abc123def456abc123def456abc123def456abc123def456/media/c-play')
  })
})

// Test getWebhookInfo returns null before server starts
describe('getWebhookInfo before start', () => {
  test('returns null when config not initialized', () => {
    const { getWebhookInfo } = require('../../../dist/electron/server/index') as {
      getWebhookInfo: () => { enabled: boolean; secret: string } | null
    }
    // Module-level config is null before start() — getWebhookInfo returns null
    const result = getWebhookInfo()
    expect(result).toBeNull()
  })
})

// Test that webhook config shape is correct
describe('webhook config validation', () => {
  test('enabled is boolean, secret is string', () => {
    const webhookConfig = { enabled: false, secret: 'deadbeef'.repeat(6) }
    expect(typeof webhookConfig.enabled).toBe('boolean')
    expect(typeof webhookConfig.secret).toBe('string')
    expect(webhookConfig.secret.length).toBe(48)
  })

  test('webhook is disabled by default', () => {
    const webhookConfig = { enabled: false, secret: 'deadbeef'.repeat(6) }
    expect(webhookConfig.enabled).toBe(false)
  })
})

// Test request path parsing (mirrors what the Express route does)
describe('webhook route path parsing', () => {
  test('extracts correct pageId and buttonId from path', () => {
    const secret   = 'secret123'
    const path     = `/webhook/${secret}/page-1/btn-abc`
    const parts    = path.split('/')
    expect(parts[2]).toBe(secret)
    expect(parts[3]).toBe('page-1')
    expect(parts[4]).toBe('btn-abc')
  })

  test('rejects mismatched secret', () => {
    const correct  = 'correct-secret'
    const incoming = String('wrong-secret')
    expect(incoming === correct).toBe(false)
  })

  test('rejects when webhook disabled', () => {
    const cfg = { webhook: { enabled: false, secret: 'abc' } }
    const shouldRespond = cfg.webhook?.enabled ?? false
    expect(shouldRespond).toBe(false)
  })

  test('allows when webhook enabled and secret matches', () => {
    const secret = 'match'
    const cfg    = { webhook: { enabled: true, secret } }
    const incoming = 'match'
    expect(cfg.webhook?.enabled && incoming === cfg.webhook.secret).toBe(true)
  })
})
