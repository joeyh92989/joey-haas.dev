import { test, expect } from './fixtures.js'
import { NOT_FOUND_PATH, routePaths } from './routes.js'

const THEMES = ['light', 'dark']
const COMICS = '/shelf/comics'
// known: /shelf/comics drops its h1 when the API is down — #181 (local runs)
const skipsH1 = (path) => path === COMICS && !process.env.E2E_BASE_URL

for (const path of routePaths()) {
  for (const theme of THEMES) {
    test(`${path} renders (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      const { response, errors } = await openRoute(path, theme)
      expect(response.status()).toBeLessThan(400)
      if (!skipsH1(path)) {
        await expect(page.locator('h1').first()).toBeVisible()
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      if (testInfo.project.name === 'phone') {
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(1)
      }
      expect(errors).toEqual([])
    })
  }
}

// known: /shelf/comics drops its h1 when the API is down — #181
// Only the local run has no API; against a live site the h1 renders.
if (!process.env.E2E_BASE_URL && routePaths().includes(COMICS)) {
  for (const theme of THEMES) {
    test(`${COMICS} h1 (known #181) (${theme})`, async ({
      page,
      openRoute,
    }) => {
      test.fail(true, 'h1 missing without a backend, #181')
      await openRoute(COMICS, theme)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  }
}

// An unknown path may come back as 404 (or as the SPA shell, per host); what
// matters is that the NotFound page's own heading renders.
for (const theme of THEMES) {
  test(`unknown path shows the NotFound page heading (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    const { errors } = await openRoute(NOT_FOUND_PATH, theme)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Not found' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    if (testInfo.project.name === 'phone') {
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    }
    expect(errors).toEqual([])
  })
}
