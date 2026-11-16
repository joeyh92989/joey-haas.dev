import { test, expect } from './fixtures.js'

/**
 * Visual baselines (#217). Run by `npm run e2e:visual` only, against a build
 * made with the fixture snapshot (e2e/fixtures/README.md), so every path
 * below exists and its content is fixed. Baselines are generated on the CI
 * runner (see frontend/README.md -> Visual baselines), never locally.
 */
const SERIES = '/shelf/22222222-bbbb-4bbb-8bbb-000000000002/'
const PAGES = {
  home: '/',
  about: '/about',
  projects: '/projects',
  post: '/blog/how-spine-works',
  'shelf-games': '/shelf/games',
  'shelf-item': '/shelf/11111111-aaaa-4aaa-8aaa-000000000001/',
  'shelf-comic': SERIES,
  'not-found': '/e2e-no-such-page',
  daily: '/daily',
}
const THEMES = ['dark', 'light']
// Any fixed instant: it sets the Daily game's number and the footer year.
const NOW = new Date('2026-06-15T18:00:00Z')

/** Lazy images below the fold stay unloaded in a full-page capture. */
async function loadAllImages(page) {
  await page.evaluate(() => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) {
      img.loading = 'eager'
    }
  })
  await page.waitForFunction(() =>
    [...document.images].every((i) => i.complete),
  )
}

for (const theme of THEMES) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${name} ${theme}`, async ({ page, openRoute }) => {
      await page.clock.setFixedTime(NOW)
      await openRoute(path, theme)
      await expect(page.locator('h1').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      await loadAllImages(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      })
    })
  }
}
