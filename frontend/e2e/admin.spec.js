import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { ADMIN_AREAS } from '../src/components/adminAreas.js'
import { KNOWN_A11Y } from './known-a11y.js'

const GATED = ['serious', 'critical']

// Every area's own pages, once each (aliases are listed under another area).
const PAGES = ADMIN_AREAS.flatMap((area) =>
  area.pages.filter((page) => !page.alias),
)

const isKnown = (route, ruleId) =>
  KNOWN_A11Y.some((entry) => entry.route === route && entry.ruleId === ruleId)

function describe(violation) {
  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(', ')
  return `${violation.id} (${violation.impact}): ${violation.help} [${violation.nodes.length} nodes] ${targets}`
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/track', (route) => route.abort())
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    })
  })
})

for (const { to, label } of PAGES) {
  test(`${to} (${label}) renders signed in, without errors or new a11y violations`, async ({
    page,
  }, testInfo) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`console: ${message.text()} ${message.location().url}`)
      }
    })

    await page.goto(to)
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.getByText('Sign in with Google')).toHaveCount(0)
    // The signed-in AdminShell: its Areas nav (rail on desktop, tab bar on
    // the phone) only renders for the admin. Page h1s are not the ADMIN_AREAS
    // labels (store list, weekend and sitting set their own), so check this.
    await expect(
      page.locator('nav[aria-label="Areas"]:visible').first(),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')

    if (testInfo.project.name === 'desktop') {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const fresh = results.violations.filter(
        (v) => GATED.includes(v.impact) && !isKnown(to, v.id),
      )
      expect(fresh.map(describe)).toEqual([])
    }
    expect(errors).toEqual([])
  })
}

test('signing out returns to the signed-out admin page', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('main h1').first()).toBeVisible()
  await page
    .getByRole('button', { name: 'Sign out' })
    .and(page.locator(':visible'))
    .first()
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Admin' }),
  ).toBeVisible()
  await expect(page.getByText('Sign in with Google')).toBeVisible()
})

test('every known a11y entry on an admin page still applies', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  const adminPaths = new Set(PAGES.map((p) => p.to))
  for (const { route, ruleId } of KNOWN_A11Y.filter((e) =>
    adminPaths.has(e.route),
  )) {
    await page.goto(route)
    await expect(page.locator('main h1').first()).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      results.violations.some((v) => v.id === ruleId),
      `${route} no longer violates ${ruleId}; remove the entry`,
    ).toBe(true)
  }
})

// A book, end to end (#334): add one to a comic, put an entry in it, flip a
// mark, delete it. The comic is made through the API with the signed-in
// session and removed again, so a rerun starts clean. Set E2E_SHOT_DIR to
// also save a full-page screenshot of the book page (the review shots).
test('a book: add it to a comic, add an entry, toggle owned, delete it', async ({
  page,
}, testInfo) => {
  const title = `E2E books (${testInfo.project.name})`
  const made = await page.request.post('/api/items', {
    data: { type: 'comic', title, status: 'backlog', is_public: true },
  })
  expect(made.status()).toBe(201)
  const { id } = await made.json()
  try {
    await page.goto(`/admin/shelf/comics/${id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible()
    await expect(
      page.getByText('No books on this title yet. Add the first one below.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Editions' })).toHaveCount(0)

    await page.getByLabel('Name', { exact: true }).fill('Deluxe One')
    await page.getByLabel('Number in its line').fill('1')
    await page.getByRole('button', { name: 'Add book' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/shelf/comics/${id}/vol-1$`))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Deluxe One' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Add entry' }).click()
    await page.getByLabel('Series as printed').fill('E2E Saga')
    await page.getByLabel('Issues as printed').fill('#1-6')
    await page.getByRole('button', { name: 'Save entry' }).click()
    await expect(page.getByText('Added “E2E Saga”.')).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'What is inside' }).getByRole('listitem'),
    ).toHaveCount(1)

    const owned = page.getByRole('button', { name: 'Owned', exact: true })
    await expect(owned).toHaveAttribute('aria-pressed', 'true')
    await owned.click()
    await expect(page.getByText('Deluxe One: Owned off.')).toBeVisible()
    await expect(owned).toHaveAttribute('aria-pressed', 'false')
    await expect(
      page.getByRole('link', { name: 'View public page' }),
    ).toHaveCount(0)

    if (testInfo.project.name === 'desktop') {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(
        results.violations
          .filter((v) => GATED.includes(v.impact))
          .map(describe),
      ).toEqual([])
    }
    if (process.env.E2E_SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/admin-volume-${testInfo.project.name}.png`,
        fullPage: true,
      })
    }

    await page.getByRole('button', { name: 'Delete Deluxe One' }).click()
    await expect(page.getByText(/goes with 1 contents entry/)).toBeVisible()
    await page
      .getByRole('button', { name: 'Delete Deluxe One for good' })
      .click()
    await expect(page).toHaveURL(new RegExp(`/admin/shelf/comics/${id}$`))
    await expect(
      page.getByText('No books on this title yet. Add the first one below.'),
    ).toBeVisible()
  } finally {
    await page.request.delete(`/api/items/${id}`)
  }
})
