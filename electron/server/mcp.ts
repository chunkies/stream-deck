import { execSync } from 'child_process'
import type { Config } from '../shared/types'

// ── Types ──────────────────────────────────────────────

export interface McpServerModule {
  pressButton(pageId: string, compId: string, hold?: boolean): void
  switchPage(pageId: string): void
  getTileValue(pageId: string, tileId: string): string | null
  createButton(opts: {
    pageId: string; label: string; icon?: string
    col: number; row: number; command?: string; color?: string
  }): string
  updateButton(pageId: string, compId: string, updates: {
    label?: string; icon?: string; color?: string; command?: string
  }): void
  deleteButton(pageId: string, compId: string): void
  getStatus(): Record<string, unknown>
  isProUser(): boolean
  getConfig(): Config | null
}

// ── Lazy CJS requires (SDK uses package exports, CJS path resolves via 'require') ──

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js') as {
  McpServer: new (info: { name: string; version: string }) => McpServerInstance
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js') as {
  StdioServerTransport: new () => StdioTransportInstance
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { z } = require('zod') as typeof import('zod')

// Minimal structural interfaces for the SDK objects we use
interface ToolContent { content: Array<{ type: 'text'; text: string }> }

interface McpServerInstance {
  tool(name: string, description: string, params: Record<string, unknown>, cb: (args: Record<string, unknown>) => ToolContent): void
  connect(transport: StdioTransportInstance): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface StdioTransportInstance {
  // opaque — we just pass it to connect()
}

// ── Factory ────────────────────────────────────────────

export function createMcpServer(serverModule: McpServerModule): McpServerInstance {
  const mcp = new McpServer({ name: 'macropad', version: '1.0.0' })

  // Helper to wrap a handler that may throw
  function ok(text: string): ToolContent {
    return { content: [{ type: 'text', text }] }
  }
  function tryRun(fn: () => ToolContent): ToolContent {
    try { return fn() } catch (err) { return ok(`Error: ${(err as Error).message}`) }
  }

  // 1. list_pages
  mcp.tool(
    'list_pages',
    'List all pages in the MacroPad configuration',
    {},
    () => tryRun(() => {
      const cfg = serverModule.getConfig()
      const pages = cfg?.pages.map(p => ({ id: p.id, name: p.name, components: p.components.length })) ?? []
      return ok(JSON.stringify(pages))
    })
  )

  // 2. list_buttons
  mcp.tool(
    'list_buttons',
    'List all components on a specific page',
    { pageId: z.string().describe('The page ID to inspect') },
    (args: Record<string, unknown>) => tryRun(() => {
      const pageId = args['pageId'] as string
      const cfg = serverModule.getConfig()
      const page = cfg?.pages.find(p => p.id === pageId)
      if (!page) return ok(`Error: Page "${pageId}" not found`)
      const items = page.components.map(c => ({
        id: c.id, label: c.label, type: c.componentType,
        col: c.col, row: c.row, color: c.color, icon: c.icon,
      }))
      return ok(JSON.stringify(items))
    })
  )

  // 3. press_button
  mcp.tool(
    'press_button',
    'Press a button on a specific page',
    {
      pageId:   z.string().describe('The page ID'),
      buttonId: z.string().describe('The button/component ID'),
      hold:     z.boolean().optional().describe('Whether to simulate a hold press'),
    },
    (args: Record<string, unknown>) => tryRun(() => {
      serverModule.pressButton(args['pageId'] as string, args['buttonId'] as string, (args['hold'] as boolean | undefined) ?? false)
      return ok('Button pressed')
    })
  )

  // 4. switch_page
  mcp.tool(
    'switch_page',
    'Navigate connected clients to a specific page',
    { pageId: z.string().describe('The page ID to navigate to') },
    (args: Record<string, unknown>) => tryRun(() => {
      serverModule.switchPage(args['pageId'] as string)
      return ok(`Switched to page "${args['pageId'] as string}"`)
    })
  )

  // 5. get_tile_value
  mcp.tool(
    'get_tile_value',
    'Get the current display value of a tile component',
    {
      pageId: z.string().describe('The page ID'),
      tileId: z.string().describe('The tile component ID'),
    },
    (args: Record<string, unknown>) => tryRun(() => {
      const val = serverModule.getTileValue(args['pageId'] as string, args['tileId'] as string)
      return ok(val ?? '(no value)')
    })
  )

  // 6. create_button
  mcp.tool(
    'create_button',
    'Create a new button component on a page',
    {
      pageId:  z.string().describe('The page ID'),
      label:   z.string().describe('Button label text'),
      icon:    z.string().optional().describe('Icon name or emoji'),
      col:     z.number().describe('Column position (1-based)'),
      row:     z.number().describe('Row position (1-based)'),
      command: z.string().optional().describe('Shell command to run when pressed'),
      color:   z.string().optional().describe('Background color hex (e.g. #1e293b)'),
    },
    (args: Record<string, unknown>) => tryRun(() => {
      const id = serverModule.createButton({
        pageId:  args['pageId']  as string,
        label:   args['label']   as string,
        icon:    args['icon']    as string | undefined,
        col:     args['col']     as number,
        row:     args['row']     as number,
        command: args['command'] as string | undefined,
        color:   args['color']   as string | undefined,
      })
      return ok(`Created button with id "${id}"`)
    })
  )

  // 7. update_button
  mcp.tool(
    'update_button',
    'Update properties of an existing button',
    {
      pageId:   z.string().describe('The page ID'),
      buttonId: z.string().describe('The button/component ID'),
      label:    z.string().optional().describe('New label text'),
      icon:     z.string().optional().describe('New icon'),
      color:    z.string().optional().describe('New background color hex'),
      command:  z.string().optional().describe('New shell command'),
    },
    (args: Record<string, unknown>) => tryRun(() => {
      serverModule.updateButton(
        args['pageId']   as string,
        args['buttonId'] as string,
        {
          label:   args['label']   as string | undefined,
          icon:    args['icon']    as string | undefined,
          color:   args['color']   as string | undefined,
          command: args['command'] as string | undefined,
        }
      )
      return ok('Button updated')
    })
  )

  // 8. delete_button
  mcp.tool(
    'delete_button',
    'Delete a button component from a page',
    {
      pageId:   z.string().describe('The page ID'),
      buttonId: z.string().describe('The button/component ID to delete'),
    },
    (args: Record<string, unknown>) => tryRun(() => {
      serverModule.deleteButton(args['pageId'] as string, args['buttonId'] as string)
      return ok('Button deleted')
    })
  )

  // 9. run_command — Pro only
  mcp.tool(
    'run_command',
    'Run a shell command on the host machine (Pro users only)',
    { command: z.string().describe('The shell command to execute') },
    (args: Record<string, unknown>) => tryRun(() => {
      if (!serverModule.isProUser()) {
        return ok('Pro required: run_command is only available to Pro users')
      }
      const output = execSync(args['command'] as string, { timeout: 10000 }).toString().trim()
      return ok(output || '(no output)')
    })
  )

  // 10. get_status
  mcp.tool(
    'get_status',
    'Get the current MacroPad server status',
    {},
    () => tryRun(() => ok(JSON.stringify(serverModule.getStatus())))
  )

  return mcp
}

// ── Entry point ────────────────────────────────────────

export async function startMcpServer(serverModule: McpServerModule): Promise<void> {
  const mcp       = createMcpServer(serverModule)
  const transport = new StdioServerTransport()
  await mcp.connect(transport)
}
