import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { KNOWN_A11Y } from './known-a11y.js'
import { KINDS } from './sitemap-sample.js'

/**
 * One page of each dynamic shelf route kind (item, year, month, edition,
 * issue), picked from the built sitemap. CI builds with the synthetic
 * snapshot in e2e/fixtures/snapshot, so every kind exists there; a build
 * without one has none of them and the test skips. With /api blocked these
 * pages render from the snapshot, or their loading shell, and must not error.
 */
const THEMES = ['light', 'dark']
const GATED = ['serious', 'critical']
const SHELF_KINDS = KINDS.slice(0, 5)

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

for (const kind of SHELF_KINDS) {
  const sample = paths.find((p) => kind.test(p))
  for (const theme of THEMES) {
    test(`dynamic route ${kind} renders cleanly (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(!sample, 'this build has no page of this kind')
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      const { errors } = await openRoute(sample, theme)
      await expect(page.locator('h1:visible').first()).not.toBeEmpty()
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
