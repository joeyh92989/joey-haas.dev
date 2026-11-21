import { test, expect } from './fixtures.js'

// Home (#530): no sideways scroll from a 320px phone to a 1440px desktop, and
// every interactive element the page added shows a focus ring.

for (const width of [320, 390, 1280, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`/ does not scroll sideways at ${width}px (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      await page.setViewportSize({ width, height: 900 })
      await openRoute('/', theme)
      await expect(
        page.getByRole('heading', { level: 1, name: /Building software/ }),
      ).toBeVisible()
      const sizes = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }))
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner)
    })
  }
}

test('Home links and buttons draw a focus ring', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
  await openRoute('/', 'light')
  const targets = [
    page.locator('.hero-actions a').first(),
    page.locator('.hero-actions a').nth(4),
    page.getByRole('region', { name: 'Work' }).getByRole('link').first(),
    page.getByRole('region', { name: 'Experience' }).getByRole('link').first(),
  ]
  for (const target of targets) {
    await target.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const style = await target.evaluate((el) => {
      const own = getComputedStyle(el).outlineStyle
      const after = getComputedStyle(el, '::after').outlineStyle
      return own !== 'none' ? own : after
    })
    expect(style).not.toBe('none')
  }
})
