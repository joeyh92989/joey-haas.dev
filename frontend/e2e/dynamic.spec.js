import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { KNOWN_A11Y } from './known-a11y.js'
import { SHELF_KINDS, sitemapPaths } from './sitemap-sample.js'

/**
 * One page of each dynamic shelf route kind (item, year, month, edition,
 * issue), picked from the built sitemap. CI builds with the synthetic
 * snapshot in e2e/fixtures/snapshot, so every kind exists there at a fixed
 * path and the exact fixture titles are asserted. Any other build (real
 * data) is sampled instead and only checked for a visible h1, axe and no
 * console errors. A missing sample fails in CI and skips elsewhere. With
 * /api blocked these pages render from the snapshot, or their loading shell,
 * and must not error. Skipped against a remote site (E2E_BASE_URL): the
 * sitemap read here is the local build's.
 */
const THEMES = ['light', 'dark']
const GATED = ['serious', 'critical']
const apiFixture = (name) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures/api', name), 'utf8')

/**
 * Per kind: the fixture's fixed path (ids are fixed in e2e/fixtures/snapshot),
 * the h1 it should produce, and the live endpoint (if any) the page reads,
 * served from e2e/fixtures/api. Item, year and month pages paint from the
 * snapshot; issue and edition pages have no snapshot read.
 */
const SERIES = '/shelf/22222222-bbbb-4bbb-8bbb-000000000002'
const EXPECTED = {
  item: {
    path: '/shelf/11111111-aaaa-4aaa-8aaa-000000000001/',
    h1: /Lantern Harbor/,
  },
  year: { path: '/shelf/year/2025/', h1: /2025 in review/ },
  month: { path: '/shelf/journal/2025-03/', h1: /March 2025/ },
  issue: {
    path: `${SERIES}/1/`,
    h1: /Paper Moons #1 · First Light/,
    api: ['**/api/public/items/*/issues/*', 'issue.json'],
  },
  edition: {
    path: `${SERIES}/ed-1-1/`,
    h1: /Paper Moons, Volume One/,
    api: ['**/api/public/items/*/editions/*', 'edition.json'],
  },
}

function readSitemap() {
  try {
    return sitemapPaths(
      readFileSync(resolve(import.meta.dirname, '../dist/sitemap.xml'), 'utf8'),
    )
  } catch {
    return []
  }
}

const paths = readSitemap()

for (const [name, kind] of Object.entries(SHELF_KINDS)) {
  const { path, h1, api } = EXPECTED[name]
  const isFixture = paths.includes(path)
  const sample = isFixture ? path : paths.find((p) => kind.test(p))
  for (const theme of THEMES) {
    test(`dynamic ${name} page renders cleanly (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(!!process.env.E2E_BASE_URL, 'sitemap is local, site remote')
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      if (!sample && process.env.CI) {
        throw new Error(
          `CI build has no ${name} page (expected ${path} in dist/sitemap.xml); copy e2e/fixtures/snapshot into public/snapshot before building`,
        )
      }
      test.skip(!sample, 'this build has no page of this kind')
      // Registered after openRoute's /api abort, so it wins for this URL.
      if (api && isFixture) {
        await page.route(api[0], (route) =>
          route.fulfill({
            contentType: 'application/json',
            body: apiFixture(api[1]),
          }),
        )
      }
      const { errors } = await openRoute(sample, theme)
      const heading = page.locator('h1:visible').first()
      if (isFixture) {
        await expect(heading).toHaveText(h1)
      } else {
        await expect(heading).toHaveText(/\S/)
      }
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
