import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

const ROOT    = path.resolve(__dirname, '../../..')
const MAIN_JS = path.join(ROOT, 'out/main/index.js')

async function launchApp() {
  const app = await electron.launch({ args: [MAIN_JS], env: { ...process.env, NODE_ENV: 'test' } })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  return { app, win }
}

// Helper: call createComponentAtCell directly via the renderer context
async function addComponentViaJS(win: any, col = 1, row = 1, compType = 'button') {
  await win.evaluate(({ col, row, compType }) => {
    // Access the module via the window's module scope isn't possible directly,
    // so we trigger a drop event on the ghost cell programmatically.
    const ghost = document.querySelector(`.ghost-cell`) as HTMLElement
    if (!ghost) return

    const dt = new DataTransfer()
    dt.setData('application/json', JSON.stringify({
      compType, pluginKey: null, label: compType, options: {}
    }))
    const dropEv = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
    ghost.dispatchEvent(dropEv)
  }, { col, row, compType })
}

// ── Initial load ───────────────────────────────────────────────────────────

test.describe('Renderer — initial load', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let win: Awaited<ReturnType<typeof app.firstWindow>>

  test.beforeAll(async () => {
    ;({ app, win } = await launchApp())
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('window title contains MacroPad', async () => {
    expect(await win.title()).toMatch(/MacroPad/i)
  })

  test('grid element is in the DOM', async () => {
    await expect(win.locator('#grid')).toBeAttached()
  })

  test('component panel is in the DOM', async () => {
    await expect(win.locator('#component-panel')).toBeAttached()
  })

  test('add-page button is visible', async () => {
    await expect(win.locator('#add-page-btn')).toBeVisible()
  })

  test('drawer is closed on load', async () => {
    await expect(win.locator('#drawer')).not.toHaveClass(/open/)
  })

  test('component panel lists core component types', async () => {
    await win.waitForSelector('#component-panel .cp-item', { timeout: 5000 })
    const count = await win.locator('#component-panel .cp-item').count()
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('page tabs row is rendered', async () => {
    await expect(win.locator('#page-tabs')).toBeAttached()
  })
})

// ── Add / edit / delete component ──────────────────────────────────────────

test.describe('Renderer — add component flow', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let win: Awaited<ReturnType<typeof app.firstWindow>>

  test.beforeAll(async () => {
    ;({ app, win } = await launchApp())
    await win.waitForSelector('#component-panel .cp-item', { timeout: 5000 })
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('dropping a component onto the grid opens the drawer', async () => {
    await addComponentViaJS(win)
    await expect(win.locator('#drawer')).toHaveClass(/open/, { timeout: 4000 })
  })

  test('modal title is shown', async () => {
    await expect(win.locator('#modal-title')).toBeVisible()
  })

  test('save button is reachable and closes the drawer', async () => {
    await win.locator('#ea-label').fill('E2E Button')
    // Scroll save button into view inside the drawer before clicking
    await win.locator('#modal-save').scrollIntoViewIfNeeded()
    await win.locator('#modal-save').click()
    await expect(win.locator('#drawer')).not.toHaveClass(/open/, { timeout: 4000 })
  })

  test('component card appears in grid after save', async () => {
    const count = await win.locator('#grid .comp-card').count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('clicking a component card opens the edit modal', async () => {
    await win.locator('#grid .comp-card').first().click()
    await expect(win.locator('#drawer')).toHaveClass(/open/, { timeout: 3000 })
    await expect(win.locator('#modal-delete')).toBeVisible()
  })

  test('delete button removes the component', async () => {
    const countBefore = await win.locator('#grid .comp-card').count()
    await win.locator('#modal-delete').scrollIntoViewIfNeeded()
    await win.locator('#modal-delete').click()
    await expect(win.locator('#drawer')).not.toHaveClass(/open/, { timeout: 3000 })
    const countAfter = await win.locator('#grid .comp-card').count()
    expect(countAfter).toBe(countBefore - 1)
  })
})
