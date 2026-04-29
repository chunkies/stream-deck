import { test, expect, mockConfig } from './fixture'

test.describe('PWA page navigation', () => {
  test('clicking second page dot switches to that page', async ({ pwaPage }) => {
    const dots = pwaPage.locator('#page-dots .page-dot')
    await dots.nth(1).click()

    await expect(pwaPage.locator('#page-name')).toHaveText('Media')
    await expect(dots.nth(1)).toHaveClass(/active/)
    await expect(dots.nth(0)).not.toHaveClass(/active/)
  })

  test('grid updates to show page 2 components after dot click', async ({ pwaPage }) => {
    await pwaPage.locator('#page-dots .page-dot').nth(1).click()

    const cells = pwaPage.locator('#grid > *')
    await expect(cells).toHaveCount(mockConfig.pages[1].components.length)
    await expect(pwaPage.locator('.btn-label').first()).toContainText('Prev')
  })

  test('clicking back to page 1 dot restores home grid', async ({ pwaPage }) => {
    // Go to page 2 then back
    await pwaPage.locator('#page-dots .page-dot').nth(1).click()
    await pwaPage.locator('#page-dots .page-dot').nth(0).click()

    await expect(pwaPage.locator('#page-name')).toHaveText('Home')
    await expect(pwaPage.locator('#grid > *')).toHaveCount(mockConfig.pages[0].components.length)
  })
})

test.describe('PWA toggleState message', () => {
  test('switch gains active class after toggleState message', async ({ pwaPage }) => {
    await pwaPage.evaluate(() => {
      ;(window as any).__mockWs.triggerMessage({ type: 'toggleState', key: 'p1:c2', active: true })
    })
    await expect(pwaPage.locator('.switch-cell')).toHaveClass(/active/)
  })
})

test.describe('PWA navigate message', () => {
  test('navigate message switches to named page', async ({ pwaPage }) => {
    await pwaPage.evaluate(() => {
      ;(window as any).__mockWs.triggerMessage({ type: 'navigate', pageId: 'p2' })
    })
    await expect(pwaPage.locator('#page-name')).toHaveText('Media')
    await expect(pwaPage.locator('#page-dots .page-dot').nth(1)).toHaveClass(/active/)
  })
})
