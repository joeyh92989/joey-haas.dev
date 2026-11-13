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
