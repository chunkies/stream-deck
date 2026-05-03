import { describe, test, expect, beforeEach } from 'vitest'
import type { Component } from '../../shared/types'
import { state }       from '../../renderer/src/state'
import { saveModal, openModal, setCompType, showButtonActionFields } from '../../renderer/src/modal'
import { initAppearanceEditor } from '../../renderer/src/appearance'

const basePage = () => ({ id: 'p1', name: 'Page 1', components: [] as Component[] })

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
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('switch', () => {
    newCompSetup('switch')
    setInput('t-action-type', 'command')
    setInput('t-on-cmd', '')
    setInput('t-off-cmd', '')
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('slider', () => {
    newCompSetup('slider')
    setInput('s-action-type', 'volume')
    setInput('s-min', '0'); setInput('s-max', '100'); setInput('s-step', '5'); setInput('s-default', '50')
    setChecked('s-infinite', false)
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('knob', () => {
    newCompSetup('knob')
    setInput('k-action-type', 'volume')
    setInput('k-min', '0'); setInput('k-max', '100'); setInput('k-step', '1'); setInput('k-default', '50')
    setChecked('k-infinite', false)
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('tile', () => {
    newCompSetup('tile')
    setInput('tile-command', ''); setInput('tile-interval', '5')
    setInput('tile-format', '{value}'); setInput('tile-tap-cmd', '')
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('voice', () => {
    newCompSetup('voice')
    setInput('voice-mode', 'smart')
    setInput('voice-command', '')
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('tile with plugin subscription', () => {
    newCompSetup('tile')
    setInput('tile-command', '')
    setInput('tile-interval', '5')
    setInput('tile-format', '{value}')
    setInput('tile-tap-cmd', '')
    setInput('ptile-plugin-id', 'my-plugin')
    setInput('ptile-event', 'update')
    setInput('ptile-field', 'value')
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })

  test('folder', () => {
    newCompSetup('folder')
    setInput('ea-icon', '📁')
    saveModal()
    expect(state.config!.pages[0].components[0].image).toBe('/media/uploaded.jpg')
  })
})

// ── adminIdx() correctness — saves to the active page, not always index 0 ──

describe('saveModal — uses adminIdx(), not hardcoded 0', () => {
  test('saves new component into the folder sub-page when in folder context', () => {
    const subPage   = { id: 'fp1', name: 'Sub Page', components: [] as Component[] }
    const folderComp: Component = { id: 'fc1', componentType: 'folder', col: 1, row: 1, colSpan: 1, rowSpan: 1, pages: [subPage] }
    state.config!.pages[0].components.push(folderComp)

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
    expect(state.config!.pages[0].components).toHaveLength(1)
  })

  test('editing existing component uses correct page', () => {
    const existingComp: Component = { id: 'c-existing', componentType: 'button', col: 1, row: 1, colSpan: 1, rowSpan: 1, label: 'Old', icon: '', color: '#1e293b', image: null, action: { type: 'builtin', key: 'media.playPause' }, holdAction: null }
    state.config!.pages[0].components.push(existingComp)

    state.editingComp     = { pageIdx: 0, compId: 'c-existing', col: 1, row: 1 }
    state.currentCompType = 'button'
    state.pendingImages   = {}

    setInput('ea-label', 'Updated')
    setInput('f-action-type', 'builtin')
    setChecked('f-hold-enable', false)
    saveModal()

    expect(state.config!.pages[0].components).toHaveLength(1)
    expect(state.config!.pages[0].components[0].label).toBe('Updated')
  })
})

// ── openModal — field population ───────────────────────

function getVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ?? ''
}


const makeComp = (overrides: Partial<Component>): Component => ({
  id: 'c1', col: 1, row: 1, colSpan: 1, rowSpan: 1, componentType: 'button',
  label: '', icon: '', color: '#1e293b', image: null, action: { type: 'builtin', key: 'media.playPause' },
  holdAction: null,
  ...overrides,
})

describe('openModal — populates form fields from existing component', () => {
  beforeEach(() => {
    state.config = { grid: { cols: 3, rows: 4 }, pages: [basePage()] }
    state.adminFolderStack = []
    state.currentPageIdx   = 0
    state.pendingImages    = {}
    initAppearanceEditor()
  })

  test('button with hotkey action populates f-hotkey', () => {
    const comp = makeComp({ action: { type: 'hotkey', combo: 'ctrl+shift+k' } })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('f-action-type')).toBe('hotkey')
    expect(getVal('f-hotkey')).toBe('ctrl+shift+k')
  })

  test('button with command action populates f-command', () => {
    const comp = makeComp({ action: { type: 'command', command: 'echo hello' } })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('f-action-type')).toBe('command')
    expect(getVal('f-command')).toBe('echo hello')
  })

  test('button with sequence action populates f-sequence and delay', () => {
    const comp = makeComp({ action: { type: 'sequence', commands: ['cmd1', 'cmd2'], delay: 200 } })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('f-action-type')).toBe('sequence')
    expect(getVal('f-sequence')).toBe('cmd1\ncmd2')
    expect(getVal('f-seq-delay')).toBe('200')
  })

  test('slider populates numeric range fields', () => {
    const comp = makeComp({
      componentType: 'slider',
      action: { type: 'volume' },
      min: 10, max: 90, step: 2, defaultValue: 45, infiniteScroll: false,
    })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('s-min')).toBe('10')
    expect(getVal('s-max')).toBe('90')
    expect(getVal('s-step')).toBe('2')
    expect(getVal('s-default')).toBe('45')
  })

  test('tile populates pollCommand and interval', () => {
    const comp = makeComp({
      componentType: 'tile',
      pollCommand: 'uptime', pollInterval: 10, tileFormat: '{value}s', tileTapCmd: '',
    })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('tile-command')).toBe('uptime')
    expect(getVal('tile-interval')).toBe('10')
    expect(getVal('tile-format')).toBe('{value}s')
  })

  test('voice populates mode and voiceCommand', async () => {
    const comp = makeComp({
      componentType: 'voice',
      voiceMode: 'template', voiceCommand: 'open browser',
    })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    // getLicenseStatus resolves asynchronously — drain two microtask levels
    await Promise.resolve(); await Promise.resolve()
    expect(getVal('voice-mode')).toBe('template')
    expect(getVal('voice-command')).toBe('open browser')
  })

  test('tile with plugin subscription populates plugin fields', () => {
    state.loadedPlugins = [{
      id: 'my-plugin', name: 'My Plugin', version: '1.0.0',
      description: '', author: '', icon: '', _local: false,
      actions: [{ key: 'cpu-update', label: 'CPU Update' }]
    }]
    const comp = makeComp({
      componentType: 'tile',
      pluginTileId: 'my-plugin', pluginTileEvent: 'cpu-update', pluginTileField: 'percent',
    })
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(getVal('ptile-plugin-id')).toBe('my-plugin')
    expect(getVal('ptile-event')).toBe('cpu-update')
    expect(getVal('ptile-field')).toBe('percent')
  })

  test('new component (null compId) sets modal title to Add', () => {
    openModal(0, null, 2, 3)
    expect(document.getElementById('modal-title')?.textContent).toBe('Add')
    expect(document.getElementById('modal-delete')?.style.display).toBe('none')
  })

  test('existing component sets modal title to Edit', () => {
    const comp = makeComp({})
    state.config!.pages[0].components.push(comp)
    openModal(0, 'c1')
    expect(document.getElementById('modal-title')?.textContent).toBe('Edit')
    expect(document.getElementById('modal-delete')?.style.display).toBe('block')
  })
})

// ── setCompType — tab switching ────────────────────────

describe('setCompType', () => {
  test('shows only the selected component panel', () => {
    setCompType('slider')
    expect(document.getElementById('comp-slider')?.style.display).toBe('block')
    expect(document.getElementById('comp-button')?.style.display).toBe('none')
  })

  test('toggle type maps to switch panel', () => {
    setCompType('toggle')
    expect(document.getElementById('comp-switch')?.style.display).toBe('block')
  })
})

// ── showButtonActionFields — field visibility ──────────

describe('showButtonActionFields', () => {
  test('shows hotkey field, hides others', () => {
    showButtonActionFields('hotkey')
    expect(document.getElementById('action-hotkey')?.style.display).toBe('block')
    expect(document.getElementById('action-command')?.style.display).toBe('none')
    expect(document.getElementById('action-builtin')?.style.display).toBe('none')
  })

  test('shows command field', () => {
    showButtonActionFields('command')
    expect(document.getElementById('action-command')?.style.display).toBe('block')
    expect(document.getElementById('action-hotkey')?.style.display).toBe('none')
  })
})
