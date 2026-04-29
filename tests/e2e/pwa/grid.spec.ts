import { test, expect, mockConfig } from './fixture'

test.describe('PWA grid rendering', () => {
  test('renders the correct number of components', async ({ pwaPage }) => {
    const cells = pwaPage.locator('#grid > *')
    await expect(cells).toHaveCount(mockConfig.pages[0].components.length)
  })

  test('button label is visible in the grid', async ({ pwaPage }) => {
    await expect(pwaPage.locator('.btn-label').first()).toContainText('Play')
  })

  test('switch cell is present', async ({ pwaPage }) => {
    await expect(pwaPage.locator('.switch-cell')).toBeVisible()
  })

  test('switch label text is correct', async ({ pwaPage }) => {
    await expect(pwaPage.locator('.switch-label')).toContainText('WiFi')
  })

  test('page name is shown in top bar', async ({ pwaPage }) => {
    await expect(pwaPage.locator('#page-name')).toHaveText('Home')
  })

  test('page dots match number of pages', async ({ pwaPage }) => {
    const dots = pwaPage.locator('#page-dots .page-dot')
    await expect(dots).toHaveCount(mockConfig.pages.length)
  })

  test('first dot is active on load', async ({ pwaPage }) => {
    const dots = pwaPage.locator('#page-dots .page-dot')
    await expect(dots.nth(0)).toHaveClass(/active/)
    await expect(dots.nth(1)).not.toHaveClass(/active/)
  })

  test('status shows connected', async ({ pwaPage }) => {
    await expect(pwaPage.locator('#ws-status')).toHaveText('Connected')
  })

  test('offline overlay is hidden when connected', async ({ pwaPage }) => {
    await expect(pwaPage.locator('#offline-overlay')).not.toHaveClass(/visible/)
  })

  test('back button is hidden on root page', async ({ pwaPage }) => {
    await expect(pwaPage.locator('#back-btn')).toHaveClass(/hidden/)
  })
})
