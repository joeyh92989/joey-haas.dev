import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

// An item page is at /shelf/<slug>/; an old /shelf/<uuid>/ link replaces
// itself with it (#479). The API is answered in the page: no backend here.
test.skip(!!process.env.E2E_BASE_URL, 'fixture API only')

const ID = '22222222-bbbb-4bbb-8bbb-000000000002'
const SLUG = 'saga-by-slug'
const body = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, 'fixtures/api/public-comic-run.json'),
    'utf8',
  ),
)

async function answer(page) {
  const reads = []
  for (const key of [ID, SLUG]) {
    await page.route(`**/api/public/items/${key}`, (route) => {
      reads.push(key)
      return route.fulfill({
        json: { ...body, id: ID, slug: SLUG },
      })
    })
  }
  return reads
}

test('an old UUID link redirects to the slug URL, replacing the history entry', async ({
  page,
  openRoute,
}) => {
  const reads = await answer(page)
  await openRoute(`/shelf/${ID}/`)
  await expect(page).toHaveURL(new RegExp(`/shelf/${SLUG}/$`))
  await expect(page.locator('h1').first()).toBeVisible()
  expect(reads).toContain(ID)
  // Replaced, not pushed: back leaves the page rather than returning to the id.
  await page.goBack()
  await expect(page).not.toHaveURL(new RegExp(ID))
})

test('the slug URL opens the item and stays', async ({ page, openRoute }) => {
  await answer(page)
  await openRoute(`/shelf/${SLUG}/`)
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/shelf/${SLUG}/$`))
})

test('an unknown key is not found and is not rewritten', async ({
  page,
  openRoute,
}) => {
  await page.route('**/api/public/items/no-such-thing', (route) =>
    route.fulfill({ status: 404, json: { detail: 'Not found' } }),
  )
  await openRoute('/shelf/no-such-thing/')
  await expect(page.locator('h1').first()).toContainText(/not found|lost|404/i)
  await expect(page).toHaveURL(/\/shelf\/no-such-thing\/$/)
})
