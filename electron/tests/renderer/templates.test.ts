import { vi, describe, test, expect, beforeEach } from 'vitest'
import type { Config } from '../../shared/types'
import { state } from '../../renderer/src/state'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../renderer/src/state', async (importActual) => ({
  ...await importActual<typeof import('../../renderer/src/state')>(),
  pushConfig: vi.fn(),
}))
vi.mock('../../renderer/src/grid',   () => ({ renderAll:  vi.fn() }))

import { pushConfig } from '../../renderer/src/state'
import { renderAll }  from '../../renderer/src/grid'
import {
  TEMPLATES,
  addTemplateToConfig,
} from '../../renderer/src/templates'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeConfig(): Config {
  return {
    grid:  { cols: 3, rows: 4 },
    pages: [{ id: 'p1', name: 'Page 1', components: [] }],
  }
}

function resetState(): void {
  state.config           = makeConfig()
  state.currentPageIdx   = 0
  state.adminFolderStack = []
}

// ── Template data ─────────────────────────────────────────────────────────────

describe('TEMPLATES — data integrity', () => {
  test('has exactly 6 templates', () => {
    expect(TEMPLATES).toHaveLength(6)
  })

  test('each template has id, name, icon, and page.components with ≥1 component', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.name).toBeTruthy()
      expect(tpl.icon).toBeTruthy()
      expect(tpl.page.components.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('Gaming template has at least 1 component', () => {
    const gaming = TEMPLATES.find(t => t.id === 'gaming')
    expect(gaming).toBeDefined()
    expect(gaming!.page.components.length).toBeGreaterThanOrEqual(1)
  })

  test('Music template has at least 1 component', () => {
    const music = TEMPLATES.find(t => t.id === 'music')
    expect(music).toBeDefined()
    expect(music!.page.components.length).toBeGreaterThanOrEqual(1)
  })

  test('OBS template has at least 1 component', () => {
    const obs = TEMPLATES.find(t => t.id === 'obs')
    expect(obs).toBeDefined()
    expect(obs!.page.components.length).toBeGreaterThanOrEqual(1)
  })

  test('Development template has at least 1 component', () => {
    const dev = TEMPLATES.find(t => t.id === 'development')
    expect(dev).toBeDefined()
    expect(dev!.page.components.length).toBeGreaterThanOrEqual(1)
  })

  test('Home Assistant template has at least 1 component', () => {
    const ha = TEMPLATES.find(t => t.id === 'home-assistant')
    expect(ha).toBeDefined()
    expect(ha!.page.components.length).toBeGreaterThanOrEqual(1)
  })

  test('Productivity template has at least 1 component', () => {
    const prod = TEMPLATES.find(t => t.id === 'productivity')
    expect(prod).toBeDefined()
    expect(prod!.page.components.length).toBeGreaterThanOrEqual(1)
  })
})

// ── addTemplateToConfig ────────────────────────────────────────────────────────

describe('addTemplateToConfig', () => {
  beforeEach(() => {
    resetState()
    vi.clearAllMocks()
  })

  test('adds a new page to config.pages', () => {
    const tpl = TEMPLATES[0]
    addTemplateToConfig(tpl)
    expect(state.config!.pages).toHaveLength(2)
  })

  test('the added page uses the template name', () => {
    const tpl = TEMPLATES[0]
    addTemplateToConfig(tpl)
    expect(state.config!.pages[1].name).toBe(tpl.page.name)
  })

  test('component IDs in the added page are unique (no collisions with template originals)', () => {
    const tpl = TEMPLATES[0]
    addTemplateToConfig(tpl)

    const addedPage        = state.config!.pages[1]
    const addedIds         = addedPage.components.map(c => c.id)
    const originalIds      = tpl.page.components.map(c => c.id)

    // No overlap with original template IDs
    const overlap = addedIds.filter(id => originalIds.includes(id))
    expect(overlap).toHaveLength(0)

    // All added IDs are unique among themselves
    const uniqueAdded = new Set(addedIds)
    expect(uniqueAdded.size).toBe(addedIds.length)
  })

  test('calls pushConfig after adding the page', () => {
    addTemplateToConfig(TEMPLATES[0])
    expect(pushConfig).toHaveBeenCalledOnce()
  })

  test('calls renderAll after adding the page', () => {
    addTemplateToConfig(TEMPLATES[0])
    expect(renderAll).toHaveBeenCalledOnce()
  })
})

