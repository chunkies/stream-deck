import { vi, describe, test, expect, beforeEach } from 'vitest'
import type { McpServerModule } from '../../server/mcp'

// ── Build a mock McpServerModule ───────────────────────

function makeMockModule(overrides: Partial<McpServerModule> = {}): McpServerModule {
  return {
    pressButton:   vi.fn(),
    switchPage:    vi.fn(),
    getTileValue:  vi.fn().mockReturnValue(null),
    createButton:  vi.fn().mockReturnValue('mcp-123'),
    updateButton:  vi.fn(),
    deleteButton:  vi.fn(),
    getStatus:     vi.fn().mockReturnValue({
      connectedClients: 0, pages: 2, tileValues: {}, plugins: [], version: '1.0.0'
    }),
    isProUser:     vi.fn().mockReturnValue(false),
    getConfig:     vi.fn().mockReturnValue({
      grid: { cols: 4, rows: 3 },
      pages: [
        { id: 'page1', name: 'Main', components: [
          { id: 'btn1', componentType: 'button', label: 'Play', col: 1, row: 1, colSpan: 1, rowSpan: 1 },
        ]},
        { id: 'page2', name: 'Media', components: [] },
      ],
    }),
    ...overrides,
  }
}

// ── Tool callback capture helper ───────────────────────
// We override the McpServer class in node_modules to intercept tool registrations.

type ToolCb = (args: Record<string, unknown>) => { content: Array<{ type: string; text: string }> }

interface CapturedTool {
  name: string
  cb:   ToolCb
}

function captureToolsFromModule(mod: McpServerModule): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>()

  // Intercept McpServer's tool() method by patching the prototype before calling createMcpServer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdkMcp = require('@modelcontextprotocol/sdk/server/mcp.js') as {
    McpServer: new (info: { name: string; version: string }) => {
      tool(name: string, description: string, params: Record<string, unknown>, cb: ToolCb): void
      connect(t: unknown): Promise<void>
    }
  }

  // Spy on the prototype to capture tool registrations
  const originalTool = sdkMcp.McpServer.prototype.tool
  sdkMcp.McpServer.prototype.tool = function(
    name: string,
    _description: string,
    _params: Record<string, unknown>,
    cb: ToolCb,
  ) {
    tools.set(name, { name, cb })
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMcpServer } = require('../../../dist/electron/server/mcp') as typeof import('../../server/mcp')
  createMcpServer(mod)

  // Restore original
  sdkMcp.McpServer.prototype.tool = originalTool

  return tools
}

// ── Tests ──────────────────────────────────────────────

describe('createMcpServer', () => {
  test('can be called without throwing', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMcpServer } = require('../../../dist/electron/server/mcp') as typeof import('../../server/mcp')
    const mod = makeMockModule()
    expect(() => createMcpServer(mod)).not.toThrow()
  })
})

describe('MCP tool logic', () => {
  let tools: Map<string, CapturedTool>
  let mod: McpServerModule

  beforeEach(() => {
    vi.resetModules()
    mod   = makeMockModule()
    tools = captureToolsFromModule(mod)
  })

  // ── list_pages ──────────────────────────────────────

  describe('list_pages', () => {
    test('returns JSON with page data', () => {
      const result = tools.get('list_pages')!.cb({})
      const pages = JSON.parse(result.content[0].text) as Array<{ id: string; name: string; components: number }>
      expect(pages).toHaveLength(2)
      expect(pages[0]).toMatchObject({ id: 'page1', name: 'Main', components: 1 })
      expect(pages[1]).toMatchObject({ id: 'page2', name: 'Media', components: 0 })
    })

    test('returns empty array when config is null', () => {
      const nullMod = makeMockModule({ getConfig: vi.fn().mockReturnValue(null) })
      const nullTools = captureToolsFromModule(nullMod)
      const result = nullTools.get('list_pages')!.cb({})
      expect(JSON.parse(result.content[0].text)).toEqual([])
    })
  })

  // ── list_buttons ────────────────────────────────────

  describe('list_buttons', () => {
    test('returns components for a known page', () => {
      const result = tools.get('list_buttons')!.cb({ pageId: 'page1' })
      const comps = JSON.parse(result.content[0].text) as Array<{ id: string }>
      expect(comps).toHaveLength(1)
      expect(comps[0].id).toBe('btn1')
    })

    test('returns error message for unknown page', () => {
      const result = tools.get('list_buttons')!.cb({ pageId: 'nonexistent' })
      expect(result.content[0].text).toMatch(/not found/)
    })
  })

  // ── press_button ────────────────────────────────────

  describe('press_button', () => {
    test('calls serverModule.pressButton with correct args', () => {
      tools.get('press_button')!.cb({ pageId: 'page1', buttonId: 'btn1', hold: false })
      expect(mod.pressButton).toHaveBeenCalledWith('page1', 'btn1', false)
    })

    test('defaults hold to false when not provided', () => {
      tools.get('press_button')!.cb({ pageId: 'page1', buttonId: 'btn1' })
      expect(mod.pressButton).toHaveBeenCalledWith('page1', 'btn1', false)
    })

    test('passes hold=true when specified', () => {
      tools.get('press_button')!.cb({ pageId: 'page1', buttonId: 'btn1', hold: true })
      expect(mod.pressButton).toHaveBeenCalledWith('page1', 'btn1', true)
    })

    test('returns "Button pressed" on success', () => {
      const result = tools.get('press_button')!.cb({ pageId: 'page1', buttonId: 'btn1' })
      expect(result.content[0].text).toBe('Button pressed')
    })
  })

  // ── switch_page ─────────────────────────────────────

  describe('switch_page', () => {
    test('calls serverModule.switchPage', () => {
      tools.get('switch_page')!.cb({ pageId: 'page2' })
      expect(mod.switchPage).toHaveBeenCalledWith('page2')
    })
  })

  // ── get_tile_value ──────────────────────────────────

  describe('get_tile_value', () => {
    test('returns value from getTileValue', () => {
      const tileMod = makeMockModule({ getTileValue: vi.fn().mockReturnValue('42°C') })
      const tileTools = captureToolsFromModule(tileMod)
      const result = tileTools.get('get_tile_value')!.cb({ pageId: 'page1', tileId: 'tile1' })
      expect(result.content[0].text).toBe('42°C')
    })

    test('returns (no value) when null', () => {
      const result = tools.get('get_tile_value')!.cb({ pageId: 'page1', tileId: 'tile1' })
      expect(result.content[0].text).toBe('(no value)')
    })
  })

  // ── create_button ───────────────────────────────────

  describe('create_button', () => {
    test('calls serverModule.createButton with correct args', () => {
      tools.get('create_button')!.cb({
        pageId: 'page1', label: 'My Button', col: 2, row: 1,
        command: 'echo hello', color: '#ff0000',
      })
      expect(mod.createButton).toHaveBeenCalledWith({
        pageId: 'page1', label: 'My Button', col: 2, row: 1,
        command: 'echo hello', color: '#ff0000',
        icon: undefined,
      })
    })

    test('returns id from createButton', () => {
      const result = tools.get('create_button')!.cb({ pageId: 'page1', label: 'X', col: 1, row: 1 })
      expect(result.content[0].text).toBe('Created button with id "mcp-123"')
    })

    test('surfaces error when createButton throws', () => {
      const errorMod = makeMockModule({ createButton: vi.fn().mockImplementation(() => { throw new Error('Page not found') }) })
      const errorTools = captureToolsFromModule(errorMod)
      const result = errorTools.get('create_button')!.cb({ pageId: 'bad', label: 'X', col: 1, row: 1 })
      expect(result.content[0].text).toMatch(/Error: Page not found/)
    })
  })

  // ── update_button ───────────────────────────────────

  describe('update_button', () => {
    test('calls serverModule.updateButton', () => {
      tools.get('update_button')!.cb({ pageId: 'page1', buttonId: 'btn1', label: 'New Label' })
      expect(mod.updateButton).toHaveBeenCalledWith(
        'page1', 'btn1',
        { label: 'New Label', icon: undefined, color: undefined, command: undefined }
      )
    })
  })

  // ── delete_button ───────────────────────────────────

  describe('delete_button', () => {
    test('calls serverModule.deleteButton', () => {
      tools.get('delete_button')!.cb({ pageId: 'page1', buttonId: 'btn1' })
      expect(mod.deleteButton).toHaveBeenCalledWith('page1', 'btn1')
    })
  })

  // ── run_command ─────────────────────────────────────

  describe('run_command', () => {
    test('returns Pro required message when isProUser() returns false', () => {
      const result = tools.get('run_command')!.cb({ command: 'echo hello' })
      expect(result.content[0].text).toBe('Pro required: run_command is only available to Pro users')
    })

    test('does NOT execute the command when not a Pro user', () => {
      // Verifies the gate prevents execution — if execSync ran with 'rm -rf /'
      // this test environment would have a bad time
      const result = tools.get('run_command')!.cb({ command: 'rm -rf /' })
      expect(result.content[0].text).toContain('Pro required')
    })
  })

  // ── get_status ──────────────────────────────────────

  describe('get_status', () => {
    test('returns status object from getStatus()', () => {
      const result = tools.get('get_status')!.cb({})
      const status = JSON.parse(result.content[0].text) as Record<string, unknown>
      expect(status).toMatchObject({
        connectedClients: 0,
        pages:            2,
        version:          '1.0.0',
      })
    })

    test('status includes plugins array', () => {
      const result = tools.get('get_status')!.cb({})
      const status = JSON.parse(result.content[0].text) as Record<string, unknown>
      expect(Array.isArray(status['plugins'])).toBe(true)
    })
  })

  // ── error handling ──────────────────────────────────

  describe('error handling', () => {
    test('tools return error text instead of throwing when handler throws', () => {
      const errorMod = makeMockModule({
        pressButton: vi.fn().mockImplementation(() => { throw new Error('Server offline') }),
      })
      const errorTools = captureToolsFromModule(errorMod)
      const result = errorTools.get('press_button')!.cb({ pageId: 'p', buttonId: 'b' })
      expect(result.content[0].text).toMatch(/Error: Server offline/)
    })
  })
})
