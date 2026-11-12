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
  if (process.env.A11Y_DUMP) {
    console.log(
      `A11Y_DUMP ${JSON.stringify({ url: page.url(), theme: await page.locator('html').getAttribute('data-theme'), violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })) })}`,
    )
  }
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
// route (in either theme) must be removed.
test('known a11y entries still apply', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  test.skip(KNOWN_A11Y.length === 0, 'no known entries')
  const stale = []
  for (const { route, ruleId } of KNOWN_A11Y) {
    let found = false
    for (const theme of THEMES) {
      await openRoute(route, theme)
      const violations = await violationsOn(page)
      found ||= violations.some((v) => v.id === ruleId)
    }
    if (!found) stale.push(`${route} ${ruleId}`)
  }
  expect(stale, 'known entries that no longer violate; remove them').toEqual([])
})
