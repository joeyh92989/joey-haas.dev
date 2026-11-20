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
    .getByRole('button', { name: /^Account, / })
    .and(page.locator(':visible'))
    .first()
    .click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Admin' }),
  ).toBeVisible()
  await expect(page.getByText('You are signed out.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Back to the public site' }),
  ).toHaveAttribute('href', '/')
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

// A book, end to end (#334): add one to a comic, put an entry in it, read
// more from its description (#327), flip a mark, delete it. The comic is made through the API with the signed-in
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

    // The admin shelf says the title's kind and its volume (#331), from the
    // real API: one owned numbered book and no issues is a single book.
    await page.goto('/admin/shelf/comics')
    const shelfCard = page.locator('.poster-card').filter({ hasText: title })
    await expect(shelfCard).toContainText('Single book')
    await expect(shelfCard).toContainText('Vol. 1')
    // The figures row counts it (#333): the book is one of the books owned,
    // and Issues read is there beside the Share read tile.
    const tiles = page.getByRole('group', { name: 'Comic totals' })
    await expect(tiles.getByText('Books owned', { exact: true })).toBeVisible()
    await expect(tiles.getByText('Issues read', { exact: true })).toBeVisible()
    await expect(tiles.getByText('Share read', { exact: true })).toBeVisible()
    if (process.env.E2E_SHOT_DIR) {
      await tiles.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/admin-comics-figures-${testInfo.project.name}.png`,
      })
    }
    await page.goto(`/admin/shelf/comics/${id}/vol-1`)
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

    // Read from description (#327): a description the rules can read, so no
    // model is asked. The typed entry stays; the new one is "Read from text".
    await page
      .getByLabel('Description', { exact: true })
      .fill('Hazel grows up. Collects E2E Saga #7-9.')
    await page.getByRole('button', { name: 'Save facts' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    await page.getByRole('button', { name: 'Read from description' }).click()
    await expect(page.getByText('Added 1 entry.')).toBeVisible()
    const inside = page.getByRole('list', { name: 'What is inside' })
    await expect(inside.getByRole('listitem')).toHaveCount(2)
    await expect(inside.getByText('Source: Read from text')).toBeVisible()
    await expect(inside.getByText('Source: Typed')).toBeVisible()

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
    await expect(page.getByText(/goes with 2 contents entries/)).toBeVisible()
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

// Story #336: a typed collected book's ISBN box. The sitting is made for real
// (the page needs a route that exists) and its GET is the intake comic fixture
// moved to Details with a trades entry; the lookup route is stubbed, since
// Open Library is never reached from a test.
test('an ISBN on a typed book: Look up fills the label and the typed ISBN is saved', async ({
  page,
}) => {
  const sittings = await import('./fixtures/api/intake-comic-sitting.json', {
    with: { type: 'json' },
  })
  const made = await page.request.post('/api/intake/sittings', {
    data: { area: 'shelf', kind: 'comic' },
  })
  expect(made.status()).toBe(201)
  const { id } = await made.json()
  const [first] = sittings.default.entries
  const entry = {
    ...first,
    payload: { detected_title: 'Saga', shelf_format: 'trades' },
    adds: undefined,
  }
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.route(`**/api/intake/sittings/${id}`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: {
              ...sittings.default,
              id,
              step: 'details',
              entries: [entry],
            },
          })
        : route.fallback(),
    )
    await page.route('**/api/intake/isbn/9781607066019', (route) =>
      route.fulfill({
        json: {
          isbn: '9781607066019',
          found: true,
          reason: null,
          title: 'Saga',
          subtitle: 'Volume One',
          volume_number: 1,
          publisher: 'Image Comics',
          year: 2012,
          pages: 160,
          cover_url: null,
          on_shelf: [],
        },
      }),
    )
    const saved = []
    await page.route(`**/api/intake/entries/${entry.id}`, (route) => {
      if (route.request().method() === 'PATCH') {
        saved.push(route.request().postDataJSON())
        return route.fulfill({
          json: { ...entry, payload: saved.at(-1).payload },
        })
      }
      return route.fallback()
    })
    await page.goto(`/admin/collection/add/${id}`)
    await page.getByRole('button', { name: 'Add a book' }).click()
    await page
      .getByLabel('ISBN, book 1', { exact: true })
      .fill('978-1-60706-601-9')
    await page.getByRole('button', { name: /Look up the ISBN/ }).click()
    await expect(page.getByLabel('Label, Vol. 1')).toHaveValue('Vol. 1')
    await expect(page.getByText(/Found: Saga: Volume One/)).toBeVisible()
    await page.getByLabel('Kind, Vol. 1').fill('Trade')
    await page.getByLabel('From issue, Vol. 1').fill('1')
    await page.getByLabel('To issue, Vol. 1').fill('6')
    await page.getByLabel('To issue, Vol. 1').blur()
    await expect.poll(() => saved.length).toBeGreaterThan(0)
    expect(saved.at(-1).payload.books).toEqual([
      {
        kind: 'Trade',
        label: 'Vol. 1',
        from: 1,
        to: 6,
        isbn: '9781607066019',
      },
    ])
    expect(errors).toEqual([])
  } finally {
    await page.request.delete(`/api/intake/sittings/${id}`)
  }
})

// A comic sitting at Check and Done, as the intake API answers them
// (story #328). There is no way to seed a comic sitting's books without a
// photo read by the model, so the sitting is made for real (the page needs a
// route that exists) and its GET answers are the bodies the backend's own
// models and plan functions produced
// (backend/scripts/export_intake_comic_fixtures.py), not hand-written ones.
test('a comic sitting: Check says what each book adds, Done lists the new books', async ({
  page,
}, testInfo) => {
  const sittings = await import('./fixtures/api/intake-comic-sitting.json', {
    with: { type: 'json' },
  })
  const commit = await import('./fixtures/api/intake-comic-commit.json', {
    with: { type: 'json' },
  })
  const made = await page.request.post('/api/intake/sittings', {
    data: { area: 'shelf', kind: 'comic' },
  })
  expect(made.status()).toBe(201)
  const { id } = await made.json()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  try {
    await page.route('**/api/intake/photos/*/image', (route) =>
      route.fulfill({ contentType: 'image/png', body: png }),
    )
    await page.route(`**/api/intake/sittings/${id}`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: { ...sittings.default, id, step: 'check' },
          })
        : route.fallback(),
    )
    await page.route(`**/api/intake/sittings/${id}/commit`, (route) =>
      route.fulfill({ json: commit.default }),
    )
    await page.goto(`/admin/collection/add/${id}`)

    await expect(page.getByText('Adds issue #7 to Saga')).toBeVisible()
    await expect(page.getByText('Adds a book to Saga').first()).toBeVisible()
    await expect(page.getByText('Starts a new title: Hidden Run')).toBeVisible()
    await expect(page.getByLabel('Number in the line').first()).toHaveValue('2')
    await expect(
      page.getByRole('list', { name: 'Contents' }).getByRole('listitem'),
    ).toHaveCount(2)
    await expect(page.getByText(/You already have/)).toContainText(
      'Saga, Book Two with these issues',
    )
    await expect(
      page.getByRole('link', { name: 'Saga, Book Two' }),
    ).toHaveAttribute('href', /\/admin\/shelf\/comics\/[0-9a-f-]+\/vol-2$/)
    await expect(
      page
        .getByText(
          'Nothing read yet - you can add contents on the book’s page after',
        )
        .first(),
    ).toBeVisible()
    if (process.env.E2E_SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/intake-check-${testInfo.project.name}.png`,
        fullPage: true,
      })
    }

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

    await page.getByRole('button', { name: /Details/ }).click()
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await page.getByRole('button', { name: /^Add \d+ to/ }).click()
    await expect(page.getByText('2 new books, 1 new title')).toBeVisible()
    const books = page.getByRole('list', { name: 'New books' })
    await expect(books.getByRole('listitem')).toHaveCount(2)
    await expect(
      books.getByRole('link', { name: 'Saga Book Two' }),
    ).toHaveAttribute('href', /\/admin\/shelf\/comics\/[0-9a-f-]+\/vol-2$/)
    await expect(
      page
        .getByRole('list', { name: 'New titles' })
        .getByRole('link', { name: 'Hidden Run' }),
    ).toBeVisible()
    if (process.env.E2E_SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/intake-done-${testInfo.project.name}.png`,
        fullPage: true,
      })
    }
  } finally {
    await page.request.delete(`/api/intake/sittings/${id}`)
  }
})
