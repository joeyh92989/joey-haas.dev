import { test, expect } from './fixtures.js'

// The shelf's chrome (#470, #473, #474) against the fixture snapshot: the
// owner is named, the first game is within one screen of the search box with
// no filter open, the Filters button is a real disclosure, and the comics
// cards in a row share a height and a lane position.
test.skip(!!process.env.E2E_BASE_URL, 'fixture snapshot only')

const WIDTHS = [390, 1440]

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      await page.setViewportSize({ width, height: 900 })
    })

    test('the first game is within one screen of the search, filters closed', async ({
      page,
      openRoute,
    }) => {
      await openRoute('/shelf/games')
      const search = page.locator('#shelf-search')
      await expect(search).toBeVisible()
      await expect(page.locator('.poster-card').first()).toBeVisible()
      const gap = await page.evaluate(() => {
        const field = document
          .querySelector('#shelf-search')
          .getBoundingClientRect()
        const card = document
          .querySelector('.poster-card')
          .getBoundingClientRect()
        return card.top - field.bottom
      })
      expect(gap).toBeLessThan(900)
      const button = page.getByRole('button', { name: /^Filters/ })
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('group', { name: 'Status' })).toBeHidden()
    })

    test('a search shows its count right under the box', async ({
      page,
      openRoute,
    }) => {
      await openRoute('/shelf/games')
      await page.locator('#shelf-search').fill('lantern')
      const count = page.locator('.resultbar strong')
      await expect(count).toContainText(' of ')
      const { field, bar, card } = await page.evaluate(() => ({
        field: document.querySelector('#shelf-search').getBoundingClientRect()
          .bottom,
        bar: document.querySelector('.resultbar').getBoundingClientRect().top,
        card: document.querySelector('.poster-card').getBoundingClientRect()
          .top,
      }))
      expect(bar - field).toBeLessThan(120)
      expect(card).toBeGreaterThan(bar)
    })

    test('the Filters button is a 44px disclosure that opens the chips', async ({
      page,
      openRoute,
    }) => {
      await openRoute('/shelf/games')
      const button = page.getByRole('button', { name: /^Filters/ })
      const box = await button.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(43.5)
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('group', { name: 'Status' })).toBeVisible()
      await page.keyboard.press('Space')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    test('names the owner on a list, an item and the Daily game', async ({
      page,
      openRoute,
    }) => {
      for (const path of ['/shelf/games', '/shelf/comics', '/daily']) {
        await openRoute(path)
        await expect(page.getByText('Joey Haas’s shelf').first()).toBeVisible()
        await expect(
          page.getByRole('link', { name: 'Part of joey-haas.dev' }).first(),
        ).toHaveAttribute('href', '/')
      }
    })

    test('comics cards in a row share a height and a lane position', async ({
      page,
      openRoute,
    }) => {
      await openRoute('/shelf/comics')
      await expect(page.locator('.poster-card').first()).toBeVisible()
      const rows = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.poster-card')]
        const byRow = new Map()
        for (const card of cards) {
          const top = Math.round(card.getBoundingClientRect().top)
          const lanes = card.querySelector('.comic-card-run > :nth-child(2)')
          const row = byRow.get(top) ?? []
          row.push({
            height: Math.round(card.getBoundingClientRect().height),
            lanes: lanes
              ? Math.round(
                  lanes.getBoundingClientRect().top -
                    card.getBoundingClientRect().top,
                )
              : null,
          })
          byRow.set(top, row)
        }
        return [...byRow.values()]
      })
      for (const row of rows) {
        expect(new Set(row.map((card) => card.height)).size).toBe(1)
        const lanes = row.map((card) => card.lanes).filter((n) => n !== null)
        expect(new Set(lanes).size).toBeLessThanOrEqual(1)
      }
    })
  })
}
