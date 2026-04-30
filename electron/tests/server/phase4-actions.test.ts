import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import http  from 'http'
import https from 'https'
import type { Action } from '../../shared/types'

// ── Helpers — mirror the production dispatch logic ─────────────────────────────
// handlePress/handleSlide are internal to server/index.ts and not exported.
// We mirror the relevant switch branches so tests remain fast (no real server).

type TileCache   = Record<string, string>
type ToggleStates = Record<string, boolean>

interface DispatchContext {
  toggleStates: ToggleStates
  tileCache:    TileCache
  httpRequests: Array<{ url: string; method: string; body: string; headers: Record<string, string> }>
  executed:     Action[]
}

function makeCtx(): DispatchContext {
  return { toggleStates: {}, tileCache: {}, httpRequests: [], executed: [] }
}

/**
 * Minimal dispatch function that mirrors the production switch in handlePress.
 * Returns whether the action was handled (true) or rejected/no-op (false).
 */
function dispatch(action: Action, ctx: DispatchContext, pageId = 'p1', compId = 'c1'): boolean {
  switch (action.type) {
    case 'builtin':
    case 'command':
    case 'hotkey':
    case 'sequence':
    case 'page':
    case 'toggle':
    case 'plugin':
    case 'volume':
    case 'scroll':
      ctx.executed.push(action)
      return true

    case 'webhook': {
      const rawUrl = action.url
      if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
        return false
      }
      try {
        const parsedUrl = new URL(rawUrl)
        const method    = action.method ?? 'POST'
        const body      = action.body ?? ''
        const headers   = action.headers ?? {}
        const transport = parsedUrl.protocol === 'https:' ? https : http
        const reqHeaders: Record<string, string> = { ...headers }
        if ((method === 'POST' || method === 'PUT') && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json'
        }
        if ((method === 'POST' || method === 'PUT') && !reqHeaders['Content-Length']) {
          reqHeaders['Content-Length'] = String(Buffer.byteLength(body))
        }
        const fakeReq = transport.request(
          { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname + parsedUrl.search, method, headers: reqHeaders },
          (res) => { res.resume() }
        )
        fakeReq.on('error', () => { /* suppress in tests */ })
        if (method === 'POST' || method === 'PUT') fakeReq.write(body)
        fakeReq.end()
        ctx.httpRequests.push({ url: rawUrl, method, body, headers: reqHeaders })
        return true
      } catch {
        return false
      }
    }

    case 'conditional': {
      let conditionMet = false
      if (action.condition === 'toggle') {
        conditionMet = !!ctx.toggleStates[action.key]
      } else if (action.condition === 'tile') {
        const tileValue = ctx.tileCache[action.key] ?? ''
        conditionMet = action.value !== undefined
          ? tileValue.includes(action.value)
          : tileValue.length > 0
      }
      const nextAction = conditionMet ? action.then : action.else
      if (nextAction) {
        dispatch(nextAction, ctx, pageId, compId)
      }
      return true
    }
  }
}

// ── webhook action tests ───────────────────────────────────────────────────────

describe('webhook action — URL validation', () => {
  test('rejects empty URL', () => {
    const ctx = makeCtx()
    const action: Action = { type: 'webhook', url: '' }
    expect(dispatch(action, ctx)).toBe(false)
    expect(ctx.httpRequests).toHaveLength(0)
  })

  test('rejects non-http/https URL (ftp scheme)', () => {
    const ctx = makeCtx()
    const action: Action = { type: 'webhook', url: 'ftp://example.com/data' }
    expect(dispatch(action, ctx)).toBe(false)
    expect(ctx.httpRequests).toHaveLength(0)
  })

  test('rejects javascript: scheme (security)', () => {
    const ctx = makeCtx()
    const action: Action = { type: 'webhook', url: 'javascript:alert(1)' }
    expect(dispatch(action, ctx)).toBe(false)
    expect(ctx.httpRequests).toHaveLength(0)
  })
})

describe('webhook action — valid requests', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpStub:  any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpsStub: any

  const fakeSock = {
    on:    vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end:   vi.fn().mockReturnThis(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpStub  = (vi.spyOn(http,  'request') as any).mockReturnValue(fakeSock)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpsStub = (vi.spyOn(https, 'request') as any).mockReturnValue(fakeSock)
  })

  afterEach(() => {
    httpStub.mockRestore()
    httpsStub.mockRestore()
  })

  test('valid http:// URL fires http.request', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'http://localhost:8080/hook', method: 'POST' }
    const result = dispatch(action, ctx)
    expect(result).toBe(true)
    expect(httpStub).toHaveBeenCalledTimes(1)
    expect(httpsStub).not.toHaveBeenCalled()
  })

  test('valid https:// URL fires https.request', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'https://example.com/api', method: 'GET' }
    const result = dispatch(action, ctx)
    expect(result).toBe(true)
    expect(httpsStub).toHaveBeenCalledTimes(1)
    expect(httpStub).not.toHaveBeenCalled()
  })

  test('method is passed correctly — GET', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'https://api.example.com/ping', method: 'GET' }
    dispatch(action, ctx)
    const [opts] = httpsStub.mock.calls[0] as [{ method: string }, unknown]
    expect(opts.method).toBe('GET')
  })

  test('method is passed correctly — PUT', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'https://api.example.com/resource', method: 'PUT', body: '{"x":1}' }
    dispatch(action, ctx)
    const [opts] = httpsStub.mock.calls[0] as [{ method: string }, unknown]
    expect(opts.method).toBe('PUT')
  })

  test('method is passed correctly — DELETE', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'https://api.example.com/resource', method: 'DELETE' }
    dispatch(action, ctx)
    const [opts] = httpsStub.mock.calls[0] as [{ method: string }, unknown]
    expect(opts.method).toBe('DELETE')
  })

  test('defaults to POST when method is omitted', () => {
    const ctx    = makeCtx()
    const action: Action = { type: 'webhook', url: 'https://api.example.com/hook' }
    dispatch(action, ctx)
    const [opts] = httpsStub.mock.calls[0] as [{ method: string }, unknown]
    expect(opts.method).toBe('POST')
  })

  test('custom headers are forwarded', () => {
    const ctx    = makeCtx()
    const action: Action = {
      type:    'webhook',
      url:     'https://api.example.com/hook',
      method:  'POST',
      headers: { 'Authorization': 'Bearer secret', 'X-Custom': 'yes' },
    }
    dispatch(action, ctx)
    const [opts] = httpsStub.mock.calls[0] as [{ headers: Record<string, string> }, unknown]
    expect(opts.headers['Authorization']).toBe('Bearer secret')
    expect(opts.headers['X-Custom']).toBe('yes')
  })
})

// ── conditional/toggle tests ───────────────────────────────────────────────────

describe('conditional — toggle condition', () => {
  test('true branch fires then-action when toggle is active', () => {
    const ctx = makeCtx()
    ctx.toggleStates['page1:btn1'] = true
    const action: Action = {
      type:      'conditional',
      condition: 'toggle',
      key:       'page1:btn1',
      then:      { type: 'command', command: 'echo on' },
      else:      { type: 'command', command: 'echo off' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(1)
    expect(ctx.executed[0]).toMatchObject({ type: 'command', command: 'echo on' })
  })

  test('false branch fires else-action when toggle is inactive', () => {
    const ctx = makeCtx()
    ctx.toggleStates['page1:btn1'] = false
    const action: Action = {
      type:      'conditional',
      condition: 'toggle',
      key:       'page1:btn1',
      then:      { type: 'command', command: 'echo on' },
      else:      { type: 'command', command: 'echo off' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(1)
    expect(ctx.executed[0]).toMatchObject({ type: 'command', command: 'echo off' })
  })

  test('missing else is a no-op when toggle is inactive', () => {
    const ctx = makeCtx()
    ctx.toggleStates['page1:btn1'] = false
    const action: Action = {
      type:      'conditional',
      condition: 'toggle',
      key:       'page1:btn1',
      then:      { type: 'command', command: 'echo on' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(0)
  })

  test('unset key treated as false — no-op without else', () => {
    const ctx = makeCtx()
    // key not in toggleStates at all
    const action: Action = {
      type:      'conditional',
      condition: 'toggle',
      key:       'page99:btnX',
      then:      { type: 'hotkey', combo: 'ctrl+a' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(0)
  })
})

// ── conditional/tile tests ─────────────────────────────────────────────────────

describe('conditional — tile condition', () => {
  test('tile-contains fires then when tile value includes target string', () => {
    const ctx = makeCtx()
    ctx.tileCache['p1:t1'] = 'running on port 3000'
    const action: Action = {
      type:      'conditional',
      condition: 'tile',
      key:       'p1:t1',
      value:     'running',
      then:      { type: 'command', command: 'echo running' },
      else:      { type: 'command', command: 'echo stopped' },
    }
    dispatch(action, ctx)
    expect(ctx.executed[0]).toMatchObject({ command: 'echo running' })
  })

  test('tile-contains fires else when tile value does not include target string', () => {
    const ctx = makeCtx()
    ctx.tileCache['p1:t1'] = 'stopped'
    const action: Action = {
      type:      'conditional',
      condition: 'tile',
      key:       'p1:t1',
      value:     'running',
      then:      { type: 'command', command: 'echo running' },
      else:      { type: 'command', command: 'echo stopped' },
    }
    dispatch(action, ctx)
    expect(ctx.executed[0]).toMatchObject({ command: 'echo stopped' })
  })

  test('missing tile key is treated as empty string — else fires', () => {
    const ctx = makeCtx()
    // tileCache has no entry for this key
    const action: Action = {
      type:      'conditional',
      condition: 'tile',
      key:       'p1:nonexistent',
      value:     'running',
      then:      { type: 'command', command: 'echo yes' },
      else:      { type: 'command', command: 'echo no' },
    }
    dispatch(action, ctx)
    expect(ctx.executed[0]).toMatchObject({ command: 'echo no' })
  })

  test('missing tile key without else is a no-op', () => {
    const ctx = makeCtx()
    const action: Action = {
      type:      'conditional',
      condition: 'tile',
      key:       'p1:nonexistent',
      value:     'running',
      then:      { type: 'command', command: 'echo yes' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(0)
  })

  test('no value field — tile condition met when tile is non-empty', () => {
    const ctx = makeCtx()
    ctx.tileCache['p1:t1'] = 'any text'
    const action: Action = {
      type:      'conditional',
      condition: 'tile',
      key:       'p1:t1',
      then:      { type: 'hotkey', combo: 'ctrl+a' },
    }
    dispatch(action, ctx)
    expect(ctx.executed[0]).toMatchObject({ type: 'hotkey', combo: 'ctrl+a' })
  })
})

// ── edge-case / malformed action tests ────────────────────────────────────────

describe('edge cases', () => {
  test('webhook with malformed URL string is rejected gracefully', () => {
    const ctx = makeCtx()
    // Starts with https:// but is not a valid URL to new URL()
    // Actually "https://" alone would throw — ensure we catch it
    const action: Action = { type: 'webhook', url: 'https://' }
    // Should not throw — returns false (URL parse throws but is caught)
    expect(() => dispatch(action, ctx)).not.toThrow()
    // No requests should have been recorded
    expect(ctx.httpRequests).toHaveLength(0)
  })

  test('conditional with both branches: correct one runs, not both', () => {
    const ctx = makeCtx()
    ctx.toggleStates['p1:c1'] = true
    const action: Action = {
      type:      'conditional',
      condition: 'toggle',
      key:       'p1:c1',
      then:      { type: 'command', command: 'then-cmd' },
      else:      { type: 'command', command: 'else-cmd' },
    }
    dispatch(action, ctx)
    expect(ctx.executed).toHaveLength(1)
    expect(ctx.executed[0]).toMatchObject({ command: 'then-cmd' })
  })
})
