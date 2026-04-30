import { vi, describe, test, expect, beforeEach } from 'vitest'
import type { Component, Page } from '../../shared/types'
import { state } from '../../renderer/src/state'

// Mock circular-import dependencies — these are only called inside event
// handlers / function bodies, so mocking them at module level is safe and
// prevents pulling in the full modal / components module graphs.
vi.mock('../../renderer/src/modal', () => ({
  openModal:  vi.fn(),
  closeModal: vi.fn(),
}))
vi.mock('../../renderer/src/components', () => ({
  createComponentAtCell: vi.fn(),
}))
vi.mock('../../renderer/src/config', () => ({
  pushConfig: vi.fn(),
}))

// Import after mocks are registered
import {
  renderAll,
  renderTabs,
  renderGrid,
  openRenameModal,
  closeRenameModal,
  saveRename,
  enterFolderAdmin,
  exitFolderAdmin,
  ptrToCell,
} from '../../renderer/src/grid'
import { closeModal } from '../../renderer/src/modal'
import { pushConfig }            from '../../renderer/src/config'

// ── Helpers ────────────────────────────────────────────────────────────────────

const makePage = (id: string, name = id, components: Component[] = []): Page =>
  ({ id, name, components, cols: undefined })

const makeComp = (overrides: Partial<Component> = {}): Component => ({
  id:            'c1',
  col:           1,
  row:           1,
  colSpan:       1,
  rowSpan:       1,
  componentType: 'button',
  label:         'Test',
  icon:          '★',
  color:         '#1e293b',
  image:         null,
  ...overrides,
})

function resetState(cols = 3, rows = 4) {
  state.config           = { grid: { cols, rows }, pages: [makePage('p1', 'Page 1')] }
  state.currentPageIdx   = 0
  state.adminFolderStack = []
  state.renamingPageIdx  = null
  state.serverInfo       = null
}

// ── ptrToCell ──────────────────────────────────────────────────────────────────

describe('ptrToCell', () => {
  function makeGridEl(left: number, top: number, width: number, height: number): HTMLElement {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({
      left, top, width, height,
      right:  left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    })
    return el
  }

  function makePointerEvent(clientX: number, clientY: number): PointerEvent {
    return { clientX, clientY } as PointerEvent
  }

  test('maps pointer at top-left to cell (1,1)', () => {
    const grid = makeGridEl(0, 0, 300, 400)
    const result = ptrToCell(makePointerEvent(1, 1), grid, 3, 4)
    expect(result).toEqual({ col: 1, row: 1 })
  })

  test('maps pointer at bottom-right to (cols, rows)', () => {
    const grid = makeGridEl(0, 0, 300, 400)
    const result = ptrToCell(makePointerEvent(299, 399), grid, 3, 4)
    expect(result).toEqual({ col: 3, row: 4 })
  })

  test('maps pointer at exact center of 4×4 grid to (2,2)', () => {
    const grid = makeGridEl(0, 0, 400, 400)
    // Center of cell (2,2): x=150, y=150  (cols 1-100, 101-200, 201-300, 301-400)
    const result = ptrToCell(makePointerEvent(150, 150), grid, 4, 4)
    expect(result).toEqual({ col: 2, row: 2 })
  })

  test('clamps pointer outside grid to valid range (too far right)', () => {
    const grid = makeGridEl(0, 0, 300, 400)
    const result = ptrToCell(makePointerEvent(9999, 200), grid, 3, 4)
    expect(result.col).toBe(3)
  })

  test('clamps pointer outside grid to valid range (negative x)', () => {
    const grid = makeGridEl(100, 0, 300, 400)
    const result = ptrToCell(makePointerEvent(0, 200), grid, 3, 4)
    expect(result.col).toBe(1)
  })

  test('handles grid with an offset (non-zero left/top)', () => {
    const grid = makeGridEl(100, 50, 300, 400)
    const result = ptrToCell(makePointerEvent(100, 50), grid, 3, 4)
    expect(result).toEqual({ col: 1, row: 1 })
  })
})

// ── renderGrid ─────────────────────────────────────────────────────────────────

describe('renderGrid — ghost cells', () => {
  beforeEach(() => {
    resetState(3, 4)
    vi.mocked(pushConfig).mockReset()
  })

  test('creates cols × rows ghost cells for an empty page', () => {
    renderGrid()
    const ghosts = document.querySelectorAll('.ghost-cell')
    expect(ghosts).toHaveLength(3 * 4) // 12
  })

  test('ghost cells have correct gridColumn / gridRow style', () => {
    resetState(2, 2)
    renderGrid()
    const ghosts = [...document.querySelectorAll<HTMLElement>('.ghost-cell')]
    const positions = ghosts.map(g => `${g.style.gridColumn},${g.style.gridRow}`)
    expect(positions).toContain('1,1')
    expect(positions).toContain('1,2')
    expect(positions).toContain('2,1')
    expect(positions).toContain('2,2')
  })

  test('sets gridTemplateColumns and gridTemplateRows on the grid element', () => {
    resetState(5, 3)
    renderGrid()
    const grid = document.getElementById('grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 1fr)')
    expect(grid.style.gridTemplateRows).toBe('repeat(3, 1fr)')
  })

  test('clears previous content before re-rendering', () => {
    renderGrid()
    const firstCount = document.querySelectorAll('.ghost-cell').length

    // Add extra component, re-render
    state.config!.pages[0].components.push(makeComp())
    renderGrid()

    const grid = document.getElementById('grid') as HTMLElement
    // Should have 12 ghosts + 1 comp card (no leftover from previous render)
    expect(grid.querySelectorAll('.ghost-cell')).toHaveLength(firstCount)
    expect(grid.querySelectorAll('.comp-card')).toHaveLength(1)
  })

  test('uses page-level cols override when present', () => {
    state.config!.pages[0].cols = 5
    renderGrid()
    const grid = document.getElementById('grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 1fr)')
    // rows still come from config.grid.rows
    expect(grid.style.gridTemplateRows).toBe('repeat(4, 1fr)')
  })

  test('falls back to config.grid.cols when page.cols is undefined', () => {
    state.config!.pages[0].cols = undefined
    renderGrid()
    const grid = document.getElementById('grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)')
  })
})

describe('renderGrid — component cards', () => {
  beforeEach(() => {
    resetState(3, 4)
    vi.mocked(pushConfig).mockReset()
  })

  test('renders one comp-card per component', () => {
    state.config!.pages[0].components = [makeComp({ id: 'a' }), makeComp({ id: 'b', col: 2 })]
    renderGrid()
    expect(document.querySelectorAll('.comp-card')).toHaveLength(2)
  })

  test('renders no comp-cards when page has no components', () => {
    state.config!.pages[0].components = []
    renderGrid()
    expect(document.querySelectorAll('.comp-card')).toHaveLength(0)
  })

  test('card gridColumn reflects colSpan', () => {
    state.config!.pages[0].components = [makeComp({ col: 1, colSpan: 2, rowSpan: 1 })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.gridColumn).toBe('1 / span 2')
  })

  test('card gridRow reflects rowSpan', () => {
    state.config!.pages[0].components = [makeComp({ row: 1, rowSpan: 3 })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.gridRow).toBe('1 / span 3')
  })

  test('defaults colSpan to 1 when missing', () => {
    const comp = makeComp()
    delete (comp as Partial<Component>).colSpan
    state.config!.pages[0].components = [comp]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.gridColumn).toBe('1 / span 1')
  })

  test('max-span component — colSpan equals cols, rowSpan equals rows', () => {
    resetState(3, 4)
    state.config!.pages[0].components = [makeComp({ col: 1, row: 1, colSpan: 3, rowSpan: 4 })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.gridColumn).toBe('1 / span 3')
    expect(card.style.gridRow).toBe('1 / span 4')
  })

  test('card background color uses comp.color', () => {
    state.config!.pages[0].components = [makeComp({ color: '#ff0000' })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.background).toBe('rgb(255, 0, 0)')
  })

  test('card background falls back to #1e293b when color is undefined', () => {
    const comp = makeComp()
    delete (comp as Partial<Component>).color
    state.config!.pages[0].components = [comp]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    // jsdom normalises hex to rgb
    expect(card.style.background).toMatch(/rgb\(30,\s*41,\s*59\)/)
  })

  test('card gets backgroundImage when comp.image and serverInfo are set', () => {
    state.serverInfo = { ip: '10.0.0.1', host: 'host', port: 3000, httpPort: 3001, mode: 'self-signed' }
    state.config!.pages[0].components = [makeComp({ image: '/media/photo.jpg' })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    expect(card.style.backgroundImage).toContain('/media/photo.jpg')
    expect(card.style.backgroundSize).toBe('cover')
    // jsdom normalises CSS shorthand 'center' → 'center center'
    expect(card.style.backgroundPosition).toMatch(/center/)
  })

  test('no backgroundImage when serverInfo is null even if comp.image is set', () => {
    state.serverInfo = null
    state.config!.pages[0].components = [makeComp({ image: '/media/photo.jpg' })]
    renderGrid()
    const card = document.querySelector<HTMLElement>('.comp-card')!
    // jsdom sets backgroundImage to 'none' when it was never set to a url()
    expect(card.style.backgroundImage).not.toContain('url(')
  })
})

// ── renderGrid — component type rendering ──────────────────────────────────────

describe('renderGrid — component type markup', () => {
  beforeEach(() => resetState(3, 4))

  test('button — renders cell-icon, cell-label, resize-handle', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'button', label: 'Play', icon: '▶' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-icon')!.textContent).toBe('▶')
    expect(card.querySelector('.cell-label')!.textContent).toBe('Play')
    expect(card.querySelector('.resize-handle')).not.toBeNull()
  })

  test('button — renders hold badge when holdAction is present', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'button', holdAction: { type: 'builtin', key: 'media.next' } })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-hold-badge')).not.toBeNull()
  })

  test('button — no hold badge when holdAction is absent', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'button', holdAction: null })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-hold-badge')).toBeNull()
  })

  test('switch — renders type badge and switch preview', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'switch', label: 'Mute' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-type-badge')!.textContent).toBe('switch')
    expect(card.querySelector('.cell-switch-preview')).not.toBeNull()
    expect(card.querySelector('.cell-label')!.textContent).toBe('Mute')
  })

  test('toggle — renders identical markup to switch', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'toggle', label: 'Toggle' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-type-badge')!.textContent).toBe('switch')
    expect(card.querySelector('.cell-switch-preview')).not.toBeNull()
  })

  test('knob — renders knob type badge', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'knob', label: 'Volume' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-type-badge')!.textContent).toBe('knob')
    expect(card.querySelector('.cell-knob-preview')).not.toBeNull()
    expect(card.querySelector('.cell-label')!.textContent).toBe('Volume')
  })

  test('tile — renders poll command (truncated to 26 chars)', () => {
    const longCmd = 'A'.repeat(30)
    state.config!.pages[0].components = [makeComp({ componentType: 'tile', label: 'CPU', pollCommand: longCmd })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-tile-cmd')!.textContent).toBe('A'.repeat(26))
    expect(card.querySelector('.cell-label')!.textContent).toBe('CPU')
  })

  test('spotify — renders spotify type badge and music icon', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'spotify' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-type-badge')!.textContent).toBe('spotify')
    expect(card.querySelector('.cell-icon')!.textContent).toBe('🎵')
  })

  test('voice — renders custom icon and label', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'voice', label: 'Assistant', icon: '🎙' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-icon')!.textContent).toBe('🎙')
    expect(card.querySelector('.cell-label')!.textContent).toBe('Assistant')
  })

  test('voice — falls back to 🎤 when icon is absent', () => {
    const comp = makeComp({ componentType: 'voice' })
    delete comp.icon
    state.config!.pages[0].components = [comp]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-icon')!.textContent).toBe('🎤')
  })

  test('plugin-tile — renders plugin id and event', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'plugin-tile', pluginTileId: 'my-plugin', pluginTileEvent: 'update', label: 'Plugin' })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-tile-cmd')!.textContent).toBe('my-plugin:update')
    expect(card.querySelector('.cell-label')!.textContent).toBe('Plugin')
  })

  test('folder — renders folder icon, label, and page count badge', () => {
    const subPage = makePage('fp1', 'Sub 1')
    state.config!.pages[0].components = [
      makeComp({ componentType: 'folder', label: 'Tools', icon: '📁', pages: [subPage] })
    ]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-icon')!.textContent).toBe('📁')
    expect(card.querySelector('.cell-label')!.textContent).toBe('Tools')
    expect(card.querySelector('.cell-hold-badge')!.textContent).toBe('1p')
  })

  test('folder — no hold badge when pages array is empty', () => {
    state.config!.pages[0].components = [makeComp({ componentType: 'folder', pages: [] })]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.cell-hold-badge')).toBeNull()
  })

  test('slider — renders fill and thumb elements', () => {
    state.config!.pages[0].components = [
      makeComp({ componentType: 'slider', orientation: 'vertical', min: 0, max: 100, defaultValue: 50 })
    ]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.card-slider-fill')).not.toBeNull()
    expect(card.querySelector('.card-slider-thumb')).not.toBeNull()
    expect(card.querySelector('.card-slider-val')!.textContent).toBe('50')
  })

  test('slider — horizontal orientation adds horiz class', () => {
    state.config!.pages[0].components = [
      makeComp({ componentType: 'slider', orientation: 'horizontal', min: 0, max: 100, defaultValue: 50 })
    ]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.card-slider.horiz')).not.toBeNull()
  })

  test('slider — vertical orientation adds vert class', () => {
    state.config!.pages[0].components = [
      makeComp({ componentType: 'slider', orientation: 'vertical', min: 0, max: 100, defaultValue: 50 })
    ]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    expect(card.querySelector('.card-slider.vert')).not.toBeNull()
  })

  test('slider — initPct falls back to 50% fill when min/max are invalid (NaN)', () => {
    state.config!.pages[0].components = [
      makeComp({ componentType: 'slider', orientation: 'vertical', min: NaN, max: NaN, defaultValue: 75 })
    ]
    renderGrid()
    const card = document.querySelector('.comp-card')!
    // initPct = 50 (fallback), so fill height is '50%' even though displayed value is NaN
    const fill = card.querySelector<HTMLElement>('.card-slider-fill')!
    expect(fill.style.height).toBe('50%')
  })
})

// ── renderGrid — uses adminIdx / adminPages correctly ──────────────────────────

describe('renderGrid — folder context', () => {
  test('renders components from sub-page when inside folder admin', () => {
    const subPage: Page   = makePage('fp1', 'Sub', [makeComp({ id: 'sub-c1', label: 'SubBtn' })])
    const folderComp = makeComp({ componentType: 'folder', pages: [subPage] })
    state.config!.pages[0].components = [folderComp]
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]

    renderGrid()

    const cards = document.querySelectorAll('.comp-card')
    // Only the sub-page component is rendered (not the folder itself)
    expect(cards).toHaveLength(1)
    expect(cards[0].querySelector('.cell-label')!.textContent).toBe('SubBtn')
  })

  test('renders root page components when folder stack is empty', () => {
    state.config!.pages[0].components = [makeComp({ label: 'Root Button' })]
    state.adminFolderStack = []

    renderGrid()

    const cards = document.querySelectorAll('.comp-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].querySelector('.cell-label')!.textContent).toBe('Root Button')
  })
})

// ── renderAll ──────────────────────────────────────────────────────────────────

describe('renderAll', () => {
  beforeEach(() => resetState(3, 4))

  test('populates both tabs and grid', () => {
    state.config!.pages = [makePage('p1', 'Home'), makePage('p2', 'Settings')]
    state.config!.pages[0].components = [makeComp()]
    renderAll()

    expect(document.querySelectorAll('#page-tabs .tab')).toHaveLength(2)
    expect(document.querySelectorAll('.comp-card')).toHaveLength(1)
  })
})

// ── renderTabs ─────────────────────────────────────────────────────────────────

describe('renderTabs', () => {
  beforeEach(() => resetState(3, 4))

  test('renders one tab per page', () => {
    state.config!.pages = [makePage('p1', 'Alpha'), makePage('p2', 'Beta'), makePage('p3', 'Gamma')]
    renderTabs()
    expect(document.querySelectorAll('#page-tabs .tab')).toHaveLength(3)
  })

  test('active tab has class "active"', () => {
    state.config!.pages    = [makePage('p1', 'A'), makePage('p2', 'B')]
    state.currentPageIdx   = 1
    renderTabs()
    const tabs = [...document.querySelectorAll('#page-tabs .tab')]
    expect(tabs[0].classList.contains('active')).toBe(false)
    expect(tabs[1].classList.contains('active')).toBe(true)
  })

  test('first tab is active when currentPageIdx is 0', () => {
    state.config!.pages  = [makePage('p1', 'Home')]
    state.currentPageIdx = 0
    renderTabs()
    const tab = document.querySelector('#page-tabs .tab')!
    expect(tab.classList.contains('active')).toBe(true)
  })

  test('tab name is set from page.name', () => {
    state.config!.pages = [makePage('p1', 'Dashboard')]
    renderTabs()
    expect(document.querySelector('.tab-name')!.textContent).toBe('Dashboard')
  })

  test('delete button shown when there are multiple tabs', () => {
    state.config!.pages = [makePage('p1', 'A'), makePage('p2', 'B')]
    renderTabs()
    const delBtns = document.querySelectorAll('.tab-del')
    expect(delBtns).toHaveLength(2)
  })

  test('no delete button when there is only one tab', () => {
    state.config!.pages = [makePage('p1', 'Solo')]
    renderTabs()
    expect(document.querySelectorAll('.tab-del')).toHaveLength(0)
  })

  test('clears previous tabs before re-rendering', () => {
    state.config!.pages = [makePage('p1', 'A'), makePage('p2', 'B')]
    renderTabs()
    state.config!.pages = [makePage('p1', 'Solo')]
    renderTabs()
    expect(document.querySelectorAll('#page-tabs .tab')).toHaveLength(1)
  })

  test('shows breadcrumb when adminFolderStack is non-empty', () => {
    const folderComp = makeComp({ componentType: 'folder', label: 'Tools', pages: [makePage('fp1')] })
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]
    renderTabs()
    expect(document.querySelector('.folder-breadcrumb')).not.toBeNull()
    expect(document.querySelector('.folder-back-btn')).not.toBeNull()
  })

  test('no breadcrumb when adminFolderStack is empty', () => {
    state.adminFolderStack = []
    renderTabs()
    expect(document.querySelector('.folder-breadcrumb')).toBeNull()
  })

  test('breadcrumb text includes folder label', () => {
    const folderComp = makeComp({ componentType: 'folder', label: 'Media', pages: [makePage('fp1')] })
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]
    renderTabs()
    const crumb = document.querySelector('.folder-crumb')!
    expect(crumb.textContent).toContain('Media')
  })

  test('clicking a tab calls setAdminIdx and re-renders', () => {
    state.config!.pages  = [makePage('p1', 'A'), makePage('p2', 'B')]
    state.currentPageIdx = 0
    renderTabs()

    const tabs = document.querySelectorAll<HTMLElement>('.tab')
    tabs[1].click()

    expect(state.currentPageIdx).toBe(1)
    // After click, tabs are re-rendered with the new active tab
    const updatedTabs = document.querySelectorAll('.tab')
    expect(updatedTabs[1].classList.contains('active')).toBe(true)
  })

  test('clicking tab-del does not trigger tab navigation', () => {
    state.config!.pages  = [makePage('p1', 'A'), makePage('p2', 'B')]
    state.currentPageIdx = 0
    renderTabs()

    // Simulate confirm returning false to avoid actual deletion
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const delBtn = document.querySelector<HTMLElement>('.tab-del')!
    delBtn.click()

    // currentPageIdx unchanged because confirm was cancelled
    expect(state.currentPageIdx).toBe(0)
    vi.restoreAllMocks()
  })
})

// ── openRenameModal / closeRenameModal / saveRename ────────────────────────────

describe('openRenameModal', () => {
  beforeEach(() => resetState(3, 4))

  test('shows rename modal', () => {
    state.config!.pages = [makePage('p1', 'My Page')]
    openRenameModal(0)
    const modal = document.getElementById('rename-modal') as HTMLElement
    expect(modal.style.display).toBe('flex')
  })

  test('populates input with current page name', () => {
    state.config!.pages = [makePage('p1', 'My Page')]
    openRenameModal(0)
    const input = document.getElementById('f-rename-name') as HTMLInputElement
    expect(input.value).toBe('My Page')
  })

  test('stores renamingPageIdx on state', () => {
    state.config!.pages = [makePage('p1', 'A'), makePage('p2', 'B')]
    openRenameModal(1)
    expect(state.renamingPageIdx).toBe(1)
  })
})

describe('closeRenameModal', () => {
  beforeEach(() => resetState(3, 4))

  test('hides rename modal', () => {
    const modal = document.getElementById('rename-modal') as HTMLElement
    modal.style.display = 'flex'
    closeRenameModal()
    expect(modal.style.display).toBe('none')
  })

  test('clears renamingPageIdx', () => {
    state.renamingPageIdx = 2
    closeRenameModal()
    expect(state.renamingPageIdx).toBeNull()
  })
})

describe('saveRename', () => {
  beforeEach(() => resetState(3, 4))

  test('updates page name and closes modal', () => {
    state.config!.pages  = [makePage('p1', 'Old Name')]
    state.renamingPageIdx = 0
    const input = document.getElementById('f-rename-name') as HTMLInputElement
    input.value = 'New Name'

    saveRename()

    expect(state.config!.pages[0].name).toBe('New Name')
    expect(state.renamingPageIdx).toBeNull()
    expect(document.getElementById('rename-modal')!.style.display).toBe('none')
  })

  test('does nothing when renamingPageIdx is null', () => {
    state.config!.pages  = [makePage('p1', 'Unchanged')]
    state.renamingPageIdx = null
    const input = document.getElementById('f-rename-name') as HTMLInputElement
    input.value = 'Changed'

    saveRename()

    expect(state.config!.pages[0].name).toBe('Unchanged')
  })

  test('does nothing when name input is empty/whitespace', () => {
    state.config!.pages  = [makePage('p1', 'Original')]
    state.renamingPageIdx = 0
    const input = document.getElementById('f-rename-name') as HTMLInputElement
    input.value = '   '

    saveRename()

    expect(state.config!.pages[0].name).toBe('Original')
  })

  test('calls pushConfig after successful rename', () => {
    vi.mocked(pushConfig).mockReset()
    state.config!.pages  = [makePage('p1', 'Old')]
    state.renamingPageIdx = 0
    const input = document.getElementById('f-rename-name') as HTMLInputElement
    input.value = 'New'

    saveRename()

    expect(pushConfig).toHaveBeenCalledOnce()
  })
})

// ── enterFolderAdmin / exitFolderAdmin ─────────────────────────────────────────

describe('enterFolderAdmin', () => {
  beforeEach(() => resetState(3, 4))

  test('pushes folder onto the stack when it has sub-pages', () => {
    const folderComp = makeComp({ componentType: 'folder', pages: [makePage('fp1')] })
    enterFolderAdmin(folderComp)
    expect(state.adminFolderStack).toHaveLength(1)
    expect(state.adminFolderStack[0].folderComp).toBe(folderComp)
    expect(state.adminFolderStack[0].pageIdx).toBe(0)
  })

  test('alerts and does not push when pages array is empty', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const folderComp = makeComp({ componentType: 'folder', pages: [] })
    enterFolderAdmin(folderComp)
    expect(alertSpy).toHaveBeenCalledOnce()
    expect(state.adminFolderStack).toHaveLength(0)
    alertSpy.mockRestore()
  })

  test('alerts and does not push when pages is undefined', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const folderComp = makeComp({ componentType: 'folder', pages: undefined })
    enterFolderAdmin(folderComp)
    expect(alertSpy).toHaveBeenCalledOnce()
    expect(state.adminFolderStack).toHaveLength(0)
    alertSpy.mockRestore()
  })

  test('calls closeModal before entering the folder', () => {
    vi.mocked(closeModal).mockReset()
    const folderComp = makeComp({ componentType: 'folder', pages: [makePage('fp1')] })
    enterFolderAdmin(folderComp)
    expect(closeModal).toHaveBeenCalledOnce()
  })
})

describe('exitFolderAdmin', () => {
  beforeEach(() => resetState(3, 4))

  test('pops the stack', () => {
    const folderComp = makeComp({ componentType: 'folder', pages: [makePage('fp1')] })
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]
    exitFolderAdmin()
    expect(state.adminFolderStack).toHaveLength(0)
  })

  test('renders root pages after exit', () => {
    state.config!.pages[0].components = [makeComp({ label: 'Root Btn' })]
    const folderComp = makeComp({ componentType: 'folder', pages: [makePage('fp1')] })
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]
    exitFolderAdmin()

    const cards = document.querySelectorAll('.comp-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].querySelector('.cell-label')!.textContent).toBe('Root Btn')
  })
})
