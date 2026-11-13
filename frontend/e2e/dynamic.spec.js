import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { KNOWN_A11Y } from './known-a11y.js'
import { SHELF_KINDS } from './sitemap-sample.js'

/**
 * One page of each dynamic shelf route kind (item, year, month, edition,
 * issue), picked from the built sitemap. CI builds with the synthetic
 * snapshot in e2e/fixtures/snapshot, so every kind exists there; a build
 * without one has none of them and the test skips. With /api blocked these
 * pages render from the snapshot, or their loading shell, and must not error.
 */
const THEMES = ['light', 'dark']
const GATED = ['serious', 'critical']
const apiFixture = (name) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures/api', name), 'utf8')

/**
 * Per kind: the h1 the fixture should produce, and the live endpoint (if any)
 * the page reads, served from e2e/fixtures/api. Item, year and month pages
 * paint from the snapshot; issue and edition pages have no snapshot read.
 */
const EXPECTED = {
  item: { h1: /Lantern Harbor/ },
  year: { h1: /2025 in review/ },
  month: { h1: /March 2025/ },
  issue: {
    h1: /Paper Moons #1 · First Light/,
    api: ['**/api/public/items/*/issues/*', 'issue.json'],
  },
  edition: {
    h1: /Paper Moons, Volume One/,
    api: ['**/api/public/items/*/editions/*', 'edition.json'],
  },
}

function sitemapPaths() {
  try {
    const xml = readFileSync(
      resolve(import.meta.dirname, '../dist/sitemap.xml'),
      'utf8',
    )
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
      const { pathname } = new URL(m[1])
      return pathname.endsWith('/') ? pathname : `${pathname}/`
    })
  } catch {
    return []
  }
}

const paths = sitemapPaths()

for (const [name, kind] of Object.entries(SHELF_KINDS)) {
  const sample = paths.find((p) => kind.test(p))
  const { h1, api } = EXPECTED[name]
  for (const theme of THEMES) {
    test(`dynamic ${name} page renders cleanly (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(!sample, 'this build has no page of this kind')
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      // Registered after openRoute's /api abort, so it wins for this URL.
      if (api) {
        await page.route(api[0], (route) =>
          route.fulfill({
            contentType: 'application/json',
            body: apiFixture(api[1]),
          }),
        )
      }
      const { errors } = await openRoute(sample, theme)
      await expect(page.locator('h1:visible').first()).toHaveText(h1)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const fresh = results.violations.filter(
        (v) =>
          GATED.includes(v.impact) &&
          !KNOWN_A11Y.some((e) => e.route === sample && e.ruleId === v.id),
      )
      expect(fresh.map((v) => `${v.id}: ${v.help}`)).toEqual([])
      expect(errors).toEqual([])
    })
  }
}
