import { test, expect } from './fixtures.js'

/**
 * The comics shelf by kind (#331), against the fixture snapshot
 * (e2e/fixtures/snapshot/comics.json: one title of each kind, written by
 * backend/scripts/export_public_comic_fixtures.py). A remote site has its own
 * shelf, so these run only against the local build.
 */
test.skip(!!process.env.E2E_BASE_URL, 'fixture snapshot only')

const card = (page, title) =>
  page
    .locator('.poster-card')
    .filter({ has: page.getByText(title, { exact: true }) })

test('each card says its kind and which volumes are owned', async ({
  page,
  openRoute,
}) => {
  await openRoute('/shelf/comics', 'light')
  await expect(card(page, 'Paper Moons')).toContainText('Run of issues')
  await expect(card(page, 'Lantern Tales')).toContainText('Line of books')
  await expect(card(page, 'Lantern Tales')).toContainText('Vol. 1, 2 and 4')
  await expect(card(page, 'Salt Road')).toContainText('Single book')
  await expect(card(page, 'Harbor Lights')).toContainText('Books and issues')
  await expect(card(page, 'Harbor Lights')).toContainText('Vol. 1 and 3')
})

test('Books and Single issues filter the shelf and are tappable', async ({
  page,
  openRoute,
}, testInfo) => {
  await openRoute('/shelf/comics', 'light')
  // The filters sit behind their button (#473).
  await page.getByRole('button', { name: /^Filters/ }).click()
  const books = page.getByRole('button', { name: /^Books/ })
  await books.click()
  await expect(page.locator('.poster-card')).toHaveCount(3)
  await expect(card(page, 'Paper Moons')).toHaveCount(0)
  await page.getByRole('button', { name: /^Single issues/ }).click()
  await expect(page.locator('.poster-card')).toHaveCount(2)
  await expect(card(page, 'Salt Road')).toHaveCount(0)
  // The phone's floor, as the tap-target check in verify.spec.js.
  if (testInfo.project.name !== 'phone') return
  for (const chip of [
    books,
    page.getByRole('button', { name: /^Single issues/ }),
  ]) {
    const box = await chip.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('the figures row counts books, missing volumes and issues read', async ({
  page,
  openRoute,
}, testInfo) => {
  await openRoute('/shelf/comics', 'light')
  const tiles = page.locator('.stat-tiles')
  // The fixture's stats are the backend's own sums over its four titles:
  // 7 books, 1 volume missing (Lantern Tales has Vol. 1, 2 and 4) and 4
  // issues read.
  const tile = (label) => tiles.locator('.stat-tile').filter({ hasText: label })
  await expect(tile('Books owned')).toContainText('7')
  await expect(tile('Volumes missing')).toContainText('1')
  await expect(tile('Issues read')).toContainText('4')
  await expect(tile('Share read')).toContainText('40%')
  // Set E2E_SHOT_DIR to save the figures row (the review shots).
  if (process.env.E2E_SHOT_DIR) {
    await tiles.screenshot({
      path: `${process.env.E2E_SHOT_DIR}/comics-figures-${testInfo.project.name}.png`,
    })
  }
})
