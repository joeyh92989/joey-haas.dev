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
