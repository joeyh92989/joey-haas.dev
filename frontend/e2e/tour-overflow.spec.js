import { test, expect } from './fixtures.js'

// /shelf/how must not scroll sideways, and its drawn captures must show every
// table column, on the narrowest phones (#475). `isMobile` matters: a real
// phone widens the layout viewport to fit the content, so a desktop-style
// resize would hide the very overflow this guards.

for (const width of [320, 360, 390]) {
  test.describe(`${width}px wide`, () => {
    test.use({
      viewport: { width, height: 800 },
      isMobile: true,
      hasTouch: true,
    })

    test('the tour does not scroll sideways and its tables fit', async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      await openRoute('/shelf/how', 'dark')
      await expect(page.locator('.tour-capture-table').first()).toBeVisible()

      const page_ = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }))
      expect(page_.scroll).toBe(page_.inner)

      const tables = await page.evaluate(() =>
        [...document.querySelectorAll('.tour-capture-table')].map((table) => ({
          table: table.scrollWidth,
          scroller: table.parentElement.clientWidth,
          figure: table.closest('.tour-capture').clientWidth,
        })),
      )
      expect(tables.length).toBeGreaterThan(0)
      for (const t of tables) {
        expect(t.table).toBeLessThanOrEqual(t.figure)
        expect(t.table).toBeLessThanOrEqual(t.scroller)
      }
    })
  })
}
