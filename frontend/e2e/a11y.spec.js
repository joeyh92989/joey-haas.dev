import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { KNOWN_A11Y } from './known-a11y.js'
import { NOT_FOUND_PATH, routePaths } from './routes.js'

const THEMES = ['light', 'dark']
const GATED = ['serious', 'critical']

const isKnown = (route, ruleId) =>
  KNOWN_A11Y.some((entry) => entry.route === route && entry.ruleId === ruleId)

/** Runs axe (WCAG 2 A/AA) on the rendered page and returns its violations. */
async function violationsOn(page) {
  await expect(page.locator('h1, main').first()).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  return results.violations
}

function describe(violation) {
  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(', ')
  return `${violation.id} (${violation.impact}): ${violation.help} [${violation.nodes.length} nodes] ${targets}`
}

const routes = [...routePaths(), NOT_FOUND_PATH]

for (const path of routes) {
  for (const theme of THEMES) {
    test(`${path} has no new serious a11y violations (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await openRoute(path, theme)
      const violations = await violationsOn(page)
      const fresh = violations.filter(
        (v) => GATED.includes(v.impact) && !isKnown(path, v.id),
      )
      expect(fresh.map(describe)).toEqual([])
    })
  }
}

// Keeps the known list honest: an entry whose rule no longer violates on its
// route (in either theme) must be removed. One test per entry, and only for
// routes this run covers (a build without /blog or /til has no such entries).
const covered = new Set(routes)
for (const { route, ruleId } of KNOWN_A11Y.filter((e) =>
  covered.has(e.route),
)) {
  test(`known a11y entry ${route} ${ruleId} still applies`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    let found = false
    for (const theme of THEMES) {
      await openRoute(route, theme)
      const violations = await violationsOn(page)
      found ||= violations.some((v) => v.id === ruleId)
    }
    expect(
      found,
      `${route} no longer violates ${ruleId}; remove the entry`,
    ).toBe(true)
  })
}

test('every known a11y entry references an issue number', () => {
  for (const entry of KNOWN_A11Y) {
    expect(entry.issue, `${entry.route} ${entry.ruleId}`).toMatch(/^#\d+$/)
  }
})
