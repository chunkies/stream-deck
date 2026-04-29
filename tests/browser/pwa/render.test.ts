import { describe, test, expect, beforeEach } from 'vitest'
import { state } from '../../../pwa/src/state.js'

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
    const { render } = await import('../../../pwa/src/render.js')
    expect(() => render()).not.toThrow()
    expect(document.getElementById('grid')!.innerHTML).toBe('')
  })

  test('renders button component to grid', async () => {
    const comp = { id: 'c1', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Play', color: '#1e293b' }
    const page = makePage('p1', [comp])
    state.config       = baseConfig([page])
    state.currentPages = [page]
    state.currentPageIdx = 0

    const { render } = await import('../../../pwa/src/render.js')
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

    const { render } = await import('../../../pwa/src/render.js')
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

    const { render } = await import('../../../pwa/src/render.js')
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

    const { render } = await import('../../../pwa/src/render.js')
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

    const { render } = await import('../../../pwa/src/render.js')
    render()

    expect(document.getElementById('page-name')!.textContent).toBe('My Board')
  })
})

// ── renderDots ─────────────────────────────────────────────────────────────

describe('renderDots', () => {
  test('renders one dot per page', async () => {
    state.config         = baseConfig([makePage('p1'), makePage('p2'), makePage('p3')])
    state.currentPages   = state.config.pages
    state.currentPageIdx = 0

    const { render } = await import('../../../pwa/src/render.js')
    render()

    expect(document.getElementById('page-dots')!.children).toHaveLength(3)
  })

  test('active dot matches currentPageIdx', async () => {
    state.config         = baseConfig([makePage('p1'), makePage('p2')])
    state.currentPages   = state.config.pages
    state.currentPageIdx = 1

    const { render } = await import('../../../pwa/src/render.js')
    render()

    const dots = document.getElementById('page-dots')!.children
    expect(dots[0].classList.contains('active')).toBe(false)
    expect(dots[1].classList.contains('active')).toBe(true)
  })

  test('back button hidden when navStack is empty', async () => {
    state.config         = baseConfig([makePage('p1')])
    state.currentPages   = state.config.pages
    state.currentPageIdx = 0
    state.navStack       = []

    const { render } = await import('../../../pwa/src/render.js')
    render()

    expect(document.getElementById('back-btn')!.classList.contains('hidden')).toBe(true)
  })

  test('back button visible when inside a folder', async () => {
    state.config         = baseConfig([makePage('p1')])
    state.currentPages   = state.config.pages
    state.currentPageIdx = 0
    state.navStack       = [{ prevPages: state.config.pages, prevIdx: 0, prevName: 'Root' }]

    const { render } = await import('../../../pwa/src/render.js')
    render()

    expect(document.getElementById('back-btn')!.classList.contains('hidden')).toBe(false)
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

    const { render }          = await import('../../../pwa/src/render.js')
    const { updateToggleBtn } = await import('../../../pwa/src/components/switch.js')
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

    const { render }          = await import('../../../pwa/src/render.js')
    const { updateToggleBtn } = await import('../../../pwa/src/components/switch.js')
    render()

    expect(document.querySelector('.switch-cell.active')).not.toBeNull()
    updateToggleBtn('p1:c1', false)
    expect(document.querySelector('.switch-cell.active')).toBeNull()
  })

  test('is a no-op when key does not exist in grid', async () => {
    const { updateToggleBtn } = await import('../../../pwa/src/components/switch.js')
    expect(() => updateToggleBtn('nonexistent:key', true)).not.toThrow()
  })
})
