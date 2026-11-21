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
        page.getByRole('heading', { level: 1, name: 'Joey Haas' }),
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
    page.locator('.hero-actions').getByRole('link', { name: /GitHub/ }),
    page
      .getByRole('region', { name: 'Work' })
      .locator('[data-slot="card"] a')
      .first(),
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

// A computed outline cannot show clipping: the Work card's `overflow-hidden`
// once cut off a ring drawn outside the card. Compare pixels of the card
// focused and not.
for (const theme of ['light', 'dark']) {
  test(`a focused Work card paints a visible ring (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
    await openRoute('/', theme)
    const work = page.getByRole('region', { name: 'Work' })
    const card = work.locator('[data-slot="card"]').first()
    const link = card.getByRole('link')
    await page.mouse.move(0, 0)
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    // A strip just inside the top edge, clear of the corners and the text:
    // where an inset ring paints and an outward one is clipped away.
    const clip = {
      x: box.x + 24,
      y: box.y + 1,
      width: box.width - 48,
      height: 3,
    }
    const before = await page.screenshot({ clip })
    await link.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    const after = await page.screenshot({ clip })
    expect(Buffer.compare(before, after)).not.toBe(0)
  })
}

// Six actions in even rows: every button is as wide as the others, and none
// wraps alone.
for (const width of [390, 1280]) {
  test(`hero actions sit in even rows at ${width}px`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width, height: 900 })
    await openRoute('/', 'light')
    const boxes = await page.locator('.hero-actions a').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), width: Math.round(r.width) }
      }),
    )
    expect(boxes).toHaveLength(6)
    const widths = new Set(boxes.map((b) => b.width))
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
    const rows = new Map()
    for (const b of boxes) rows.set(b.top, (rows.get(b.top) ?? 0) + 1)
    const sizes = [...rows.values()]
    expect(new Set(sizes).size).toBe(1)
  })
}
