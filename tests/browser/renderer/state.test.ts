import { describe, test, expect, beforeEach } from 'vitest'
import { state, adminPages, adminIdx, setAdminIdx } from '../../../src/renderer/src/state'

const makePage  = (id: string) => ({ id, name: id, components: [] as any[] })
const makeFolderComp = (pages: any[]) => ({ id: 'fc1', componentType: 'folder', pages })

beforeEach(() => {
  state.config           = { grid: { cols: 3, rows: 4 }, pages: [makePage('root')] }
  state.currentPageIdx   = 0
  state.adminFolderStack = []
})

// ── adminPages() ───────────────────────────────────────────────────────────

describe('adminPages', () => {
  test('returns config.pages when not in a folder', () => {
    expect(adminPages()).toBe(state.config.pages)
  })

  test('returns folder sub-pages when one level deep', () => {
    const subPages   = [makePage('sub1')]
    const folderComp = makeFolderComp(subPages)
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]

    expect(adminPages()).toBe(subPages)
    expect(adminPages()).not.toBe(state.config.pages)
  })

  test('returns innermost folder pages when nested two levels deep', () => {
    const innerPages  = [makePage('inner')]
    const innerFolder = makeFolderComp(innerPages)
    const outerPages  = [innerFolder]
    const outerFolder = makeFolderComp(outerPages)

    state.adminFolderStack = [
      { folderComp: outerFolder, pageIdx: 0 },
      { folderComp: innerFolder, pageIdx: 0 },
    ]

    expect(adminPages()).toBe(innerPages)
  })
})

// ── adminIdx() ─────────────────────────────────────────────────────────────

describe('adminIdx', () => {
  test('returns currentPageIdx when not in a folder', () => {
    state.currentPageIdx = 2
    expect(adminIdx()).toBe(2)
  })

  test('returns folder pageIdx when in a folder', () => {
    const folderComp = makeFolderComp([makePage('sub')])
    state.adminFolderStack = [{ folderComp, pageIdx: 1 }]

    expect(adminIdx()).toBe(1)
  })

  test('root currentPageIdx is unaffected when inside folder', () => {
    state.currentPageIdx = 3
    const folderComp = makeFolderComp([makePage('sub')])
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]

    expect(adminIdx()).toBe(0)
    expect(state.currentPageIdx).toBe(3)
  })
})

// ── setAdminIdx() ──────────────────────────────────────────────────────────

describe('setAdminIdx', () => {
  test('sets currentPageIdx when not in a folder', () => {
    setAdminIdx(2)
    expect(state.currentPageIdx).toBe(2)
  })

  test('sets folder pageIdx when in a folder', () => {
    const folderComp = makeFolderComp([makePage('s0'), makePage('s1')])
    state.adminFolderStack = [{ folderComp, pageIdx: 0 }]

    setAdminIdx(1)

    expect(state.adminFolderStack[0].pageIdx).toBe(1)
    expect(state.currentPageIdx).toBe(0)  // root unchanged
  })

  test('updates only the innermost folder when nested', () => {
    const innerFolder = makeFolderComp([makePage('i0'), makePage('i1')])
    const outerFolder = makeFolderComp([innerFolder])

    state.adminFolderStack = [
      { folderComp: outerFolder, pageIdx: 0 },
      { folderComp: innerFolder, pageIdx: 0 },
    ]

    setAdminIdx(1)

    expect(state.adminFolderStack[1].pageIdx).toBe(1)  // inner updated
    expect(state.adminFolderStack[0].pageIdx).toBe(0)  // outer untouched
  })
})

// ── adminFolderStack — push / pop semantics ────────────────────────────────

describe('adminFolderStack navigation', () => {
  test('entering a folder increases stack depth', () => {
    const folderComp = makeFolderComp([makePage('sub')])
    state.adminFolderStack.push({ folderComp, pageIdx: 0 })

    expect(state.adminFolderStack).toHaveLength(1)
    expect(adminPages()).toBe(folderComp.pages)
  })

  test('exiting a folder (pop) restores root context', () => {
    const folderComp = makeFolderComp([makePage('sub')])
    state.adminFolderStack.push({ folderComp, pageIdx: 0 })
    state.adminFolderStack.pop()

    expect(state.adminFolderStack).toHaveLength(0)
    expect(adminPages()).toBe(state.config.pages)
  })

  test('clearing stack resets to root', () => {
    const fc1 = makeFolderComp([makePage('a')])
    const fc2 = makeFolderComp([makePage('b')])
    state.adminFolderStack.push({ folderComp: fc1, pageIdx: 0 })
    state.adminFolderStack.push({ folderComp: fc2, pageIdx: 0 })

    state.adminFolderStack.length = 0

    expect(adminPages()).toBe(state.config.pages)
    expect(adminIdx()).toBe(state.currentPageIdx)
  })
})
