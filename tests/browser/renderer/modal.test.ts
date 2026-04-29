import { describe, test, expect, beforeEach } from 'vitest'
import { state }     from '../../../src/renderer/src/state'
import { saveModal } from '../../../src/renderer/src/modal'
import { initAppearanceEditor } from '../../../src/renderer/src/appearance'

const basePage = () => ({ id: 'p1', name: 'Page 1', components: [] as any[] })

function setInput(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement
  if (el) el.value = value
}
function setChecked(id: string, checked: boolean) {
  const el = document.getElementById(id) as HTMLInputElement
  if (el) el.checked = checked
}

beforeEach(() => {
  initAppearanceEditor()
  state.config          = { grid: { cols: 3, rows: 4 }, pages: [basePage()] }
  state.adminFolderStack = []
  state.currentPageIdx  = 0
  state.currentGradient = null
  state.pendingImages   = { image: '/media/uploaded.jpg' }

  // Minimal appearance inputs
  setInput('ea-color', '#1e293b')
  setInput('ea-label', 'Test')
  setInput('ea-icon',  '')
  setInput('ea-img-url', '')
  setInput('ea-active-color', '#4f46e5')
  setInput('f-col-span', '1')
  setInput('f-row-span', '1')
})

// ── Image persistence — each type must include ea.image in fields ──────────

describe('saveModal — image saved for all component types', () => {
  function newCompSetup(type: string) {
    state.currentCompType = type
    state.editingComp     = { pageIdx: 0, compId: null, col: 1, row: 1 }
  }

  test('button', () => {
    newCompSetup('button')
    setInput('f-action-type', 'builtin')
    setChecked('f-hold-enable', false)
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('switch', () => {
    newCompSetup('switch')
    setInput('t-action-type', 'command')
    setInput('t-on-cmd', '')
    setInput('t-off-cmd', '')
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('slider', () => {
    newCompSetup('slider')
    setInput('s-action-type', 'volume')
    setInput('s-min', '0'); setInput('s-max', '100'); setInput('s-step', '5'); setInput('s-default', '50')
    setChecked('s-infinite', false)
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('knob', () => {
    newCompSetup('knob')
    setInput('k-action-type', 'volume')
    setInput('k-min', '0'); setInput('k-max', '100'); setInput('k-step', '1'); setInput('k-default', '50')
    setChecked('k-infinite', false)
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('tile', () => {
    newCompSetup('tile')
    setInput('tile-command', ''); setInput('tile-interval', '5')
    setInput('tile-format', '{value}'); setInput('tile-tap-cmd', '')
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('voice', () => {
    newCompSetup('voice')
    setInput('voice-mode', 'smart')
    setInput('voice-command', '')
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('plugin-tile', () => {
    newCompSetup('plugin-tile')
    setInput('ptile-plugin-id', 'my-plugin')
    setInput('ptile-event', 'update')
    setInput('ptile-field', 'value')
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('folder', () => {
    newCompSetup('folder')
    setInput('ea-icon', '📁')
    saveModal()
    expect(state.config.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })
})

// ── adminIdx() correctness — saves to the active page, not always index 0 ──

describe('saveModal — uses adminIdx(), not hardcoded 0', () => {
  test('saves new component into the folder sub-page when in folder context', () => {
    const subPage   = { id: 'fp1', name: 'Sub Page', components: [] as any[] }
    const folderComp = { id: 'fc1', componentType: 'folder', pages: [subPage] }
    state.config.pages[0].components.push(folderComp)

    // Simulate being inside the folder admin
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]
    state.editingComp      = { pageIdx: 0, compId: null, col: 2, row: 1 }
    state.currentCompType  = 'button'
    state.pendingImages    = {}

    setInput('f-action-type', 'builtin')
    setChecked('f-hold-enable', false)
    saveModal()

    // New component must be in the sub-page, not the root page
    expect(subPage.components).toHaveLength(1)
    expect(subPage.components[0].componentType).toBe('button')
    // Root page still only has the folder component
    expect(state.config.pages[0].components).toHaveLength(1)
  })

  test('editing existing component uses correct page', () => {
    const existingComp = { id: 'c-existing', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Old', icon: '', color: '#1e293b', image: null, action: { type: 'builtin', key: 'media.playPause' }, holdAction: null }
    state.config.pages[0].components.push(existingComp)

    state.editingComp     = { pageIdx: 0, compId: 'c-existing', col: 1, row: 1 }
    state.currentCompType = 'button'
    state.pendingImages   = {}

    setInput('ea-label', 'Updated')
    setInput('f-action-type', 'builtin')
    setChecked('f-hold-enable', false)
    saveModal()

    expect(state.config.pages[0].components).toHaveLength(1)
    expect(state.config.pages[0].components[0].label).toBe('Updated')
  })
})
