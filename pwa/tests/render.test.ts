import { describe, test, expect, beforeEach } from 'vitest'
import { state } from '../src/state.js'

const makePage = (id: string, components: any[] = []) => ({
  id, name: id, components,
})

const baseConfig = (pages: any[]) => ({
  grid: { cols: 3, rows: 3 },
  pages,
})

beforeEach(async () => {
  // Reset module state between tests
  state.config           = null
  state.currentPageIdx   = 0
  state.currentPages     = null
  state.navStack         = []
  state.toggleStates     = {}
  document.getElementById('grid')!.innerHTML = ''
  document.getElementById('page-dots')!.innerHTML = ''
})

// ── render() is a no-op without config ────────────────────────────────────

describe('render', () => {
  test('does not throw when config is null', async () => {
    const { render } = await import('../src/render.js')
    expect(() => render()).not.toThrow()
    expect(document.getElementById('grid')!.innerHTML).toBe('')
  })

  test('renders button component to grid', async () => {
    const comp = { id: 'c1', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Play', color: '#1e293b' }
    const page = makePage('p1', [comp])
    state.config       = baseConfig([page])
    state.currentPages = [page]
    state.currentPageIdx = 0

    const { render } = await import('../src/render.js')
    render()

    const grid = document.getElementById('grid')!
    expect(grid.children).toHaveLength(1)
    expect(grid.children[0].textContent).toContain('Play')
  })

  test('renders switch with active class when toggleStates has it', async () => {
    const comp = { id: 'c1', componentType: 'switch', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'WiFi', color: '#1e293b' }
    const page = makePage('p1', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0
    state.toggleStates   = { 'p1:c1': true }

    const { render } = await import('../src/render.js')
    render()

    const grid = document.getElementById('grid')!
    expect(grid.querySelector('.switch-cell')).not.toBeNull()
    expect(grid.querySelector('.switch-cell.active')).not.toBeNull()
  })

  test('renders switch without active class when toggle is off', async () => {
    const comp = { id: 'c2', componentType: 'switch', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'BT', color: '#1e293b' }
    const page = makePage('p2', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0
    state.toggleStates   = {}

    const { render } = await import('../src/render.js')
    render()

    const grid = document.getElementById('grid')!
    expect(grid.querySelector('.switch-cell.active')).toBeNull()
  })

  test('grid-column/row placement matches component position', async () => {
    const comp = { id: 'c1', componentType: 'button', col: 2, row: 3, colSpan: 2, rowSpan: 1, label: 'Big', color: '#000' }
    const page = makePage('p1', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0

    const { render } = await import('../src/render.js')
    render()

    const el = document.getElementById('grid')!.children[0] as HTMLElement
    expect(el.style.gridColumn).toBe('2 / span 2')
    expect(el.style.gridRow).toBe('3 / span 1')
  })

  test('page name updates on render', async () => {
    const page = makePage('My Board')
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0

    const { render } = await import('../src/render.js')
    render()

    expect(document.getElementById('page-name')!.textContent).toBe('My Board')
  })
})

// ── renderDots ─────────────────────────────────────────────────────────────

describe('renderDots', () => {
  test('renders one dot per page', async () => {
    state.config         = baseConfig([makePage('p1'), makePage('p2'), makePage('p3')])
    state.currentPages   = state.config!.pages
    state.currentPageIdx = 0

    const { render } = await import('../src/render.js')
    render()

    expect(document.getElementById('page-dots')!.children).toHaveLength(3)
  })

  test('active dot matches currentPageIdx', async () => {
    state.config         = baseConfig([makePage('p1'), makePage('p2')])
    state.currentPages   = state.config!.pages
    state.currentPageIdx = 1

    const { render } = await import('../src/render.js')
    render()

    const dots = document.getElementById('page-dots')!.children
    expect(dots[0].classList.contains('active')).toBe(false)
    expect(dots[1].classList.contains('active')).toBe(true)
  })

  test('back button hidden when navStack is empty', async () => {
    state.config         = baseConfig([makePage('p1')])
    state.currentPages   = state.config!.pages
    state.currentPageIdx = 0
    state.navStack       = []

    const { render } = await import('../src/render.js')
    render()

    expect(document.getElementById('back-btn')!.classList.contains('hidden')).toBe(true)
  })

  test('back button visible when inside a folder', async () => {
    state.config         = baseConfig([makePage('p1')])
    state.currentPages   = state.config!.pages
    state.currentPageIdx = 0
    state.navStack       = [{ pages: state.config!.pages, pageIdx: 0 }]

    const { render } = await import('../src/render.js')
    render()

    expect(document.getElementById('back-btn')!.classList.contains('hidden')).toBe(false)
  })
})

// ── data-key attribute on all component types ──────────────────────────────

describe('data-key attribute on all component types', () => {
  const page: any = { id: 'p1', name: 'Test', components: [] }

  test('button has data-key', async () => {
    const comp: any = { id: 'c1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button', action: { type: 'builtin', key: 'media.playPause' }, holdAction: null }
    const { createButton } = await import('../src/components/button.js')
    const el = createButton(comp, page)
    expect(el.dataset['key']).toBe('p1:c1')
  })

  test('tile has data-key', async () => {
    const comp: any = { id: 'c2', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'tile' }
    const { createTile } = await import('../src/components/tile.js')
    const el = createTile(comp, page)
    expect(el.dataset['key']).toBe('p1:c2')
  })

  test('tile with plugin subscription sets data attributes', async () => {
    const comp: any = { id: 'c9', col: 1, row: 1, colSpan: 2, rowSpan: 1, componentType: 'tile', pluginTileId: 'system-info', pluginTileEvent: 'cpu', pluginTileField: 'text' }
    const { createTile } = await import('../src/components/tile.js')
    const el = createTile(comp, page)
    expect(el.dataset['pluginId']).toBe('system-info')
    expect(el.dataset['eventName']).toBe('cpu')
    expect(el.dataset['field']).toBe('text')
  })

  test('switch has data-key', async () => {
    const comp: any = { id: 'c3', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'switch' }
    const { createSwitch } = await import('../src/components/switch.js')
    const el = createSwitch(comp, page)
    expect(el.dataset['key']).toBe('p1:c3')
  })

  test('slider has data-key', async () => {
    const comp: any = { id: 'c4', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'slider' }
    const { createSlider } = await import('../src/components/slider.js')
    const el = createSlider(comp, page)
    expect(el.dataset['key']).toBe('p1:c4')
  })

  test('knob has data-key', async () => {
    const comp: any = { id: 'c5', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'knob' }
    const { createKnob } = await import('../src/components/knob.js')
    const el = createKnob(comp, page)
    expect(el.dataset['key']).toBe('p1:c5')
  })
})

// ── updateToggleBtn ────────────────────────────────────────────────────────

describe('updateToggleBtn', () => {
  test('adds active class to matching element', async () => {
    const comp = { id: 'c1', componentType: 'switch', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'WiFi', color: '#000' }
    const page = makePage('p1', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0
    state.toggleStates   = {}

    const { render }          = await import('../src/render.js')
    const { updateToggleBtn } = await import('../src/components/switch.js')
    render()

    expect(document.querySelector('.switch-cell.active')).toBeNull()
    updateToggleBtn('p1:c1', true)
    expect(document.querySelector('.switch-cell.active')).not.toBeNull()
  })

  test('removes active class when set to false', async () => {
    const comp = { id: 'c1', componentType: 'switch', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'WiFi', color: '#000' }
    const page = makePage('p1', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0
    state.toggleStates   = { 'p1:c1': true }

    const { render }          = await import('../src/render.js')
    const { updateToggleBtn } = await import('../src/components/switch.js')
    render()

    expect(document.querySelector('.switch-cell.active')).not.toBeNull()
    updateToggleBtn('p1:c1', false)
    expect(document.querySelector('.switch-cell.active')).toBeNull()
  })

  test('is a no-op when key does not exist in grid', async () => {
    const { updateToggleBtn } = await import('../src/components/switch.js')
    expect(() => updateToggleBtn('nonexistent:key', true)).not.toThrow()
  })
})

// ── updateTileFromEvent — plugin subscription ──────────────────────────────

describe('updateTileFromEvent', () => {
  test('updates tile value when plugin id and event match', async () => {
    const comp: any = { id: 'c1', col: 1, row: 1, colSpan: 2, rowSpan: 1, componentType: 'tile', pluginTileId: 'system-info', pluginTileEvent: 'cpu', pluginTileField: 'text' }
    const page = makePage('p1', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0

    const { render }             = await import('../src/render.js')
    const { updateTileFromEvent } = await import('../src/components/tile.js')
    render()

    const msg: any = { type: 'pluginEvent', pluginId: 'system-info', event: 'cpu', text: '42%' }
    updateTileFromEvent('system-info', 'cpu', msg)

    const val = document.querySelector('.tile-cell .tile-value')!
    expect(val.textContent).toBe('42%')
  })

  test('does not update tile when plugin id does not match', async () => {
    const comp: any = { id: 'c2', col: 1, row: 1, colSpan: 2, rowSpan: 1, componentType: 'tile', pluginTileId: 'system-info', pluginTileEvent: 'cpu', pluginTileField: 'text' }
    const page = makePage('p2', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0

    const { render }             = await import('../src/render.js')
    const { updateTileFromEvent } = await import('../src/components/tile.js')
    render()

    const msg: any = { type: 'pluginEvent', pluginId: 'other-plugin', event: 'cpu', text: '99%' }
    updateTileFromEvent('other-plugin', 'cpu', msg)

    const val = document.querySelector('.tile-cell .tile-value')!
    expect(val.textContent).toBe('—')
  })

  test('plain tile without plugin subscription is not updated', async () => {
    const comp: any = { id: 'c3', col: 1, row: 1, colSpan: 2, rowSpan: 1, componentType: 'tile', label: 'Static' }
    const page = makePage('p3', [comp])
    state.config         = baseConfig([page])
    state.currentPages   = [page]
    state.currentPageIdx = 0

    const { render }             = await import('../src/render.js')
    const { updateTileFromEvent } = await import('../src/components/tile.js')
    render()

    const msg: any = { type: 'pluginEvent', pluginId: 'system-info', event: 'cpu', text: '55%' }
    updateTileFromEvent('system-info', 'cpu', msg)

    const val = document.querySelector('.tile-cell .tile-value')!
    expect(val.textContent).toBe('—')
  })
})
