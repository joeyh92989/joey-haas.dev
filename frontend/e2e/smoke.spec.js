import { test, expect } from './fixtures.js'
import { NOT_FOUND_PATH, routePaths } from './routes.js'

const THEMES = ['light', 'dark']

for (const path of routePaths()) {
  for (const theme of THEMES) {
    test(`${path} renders (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      // known: /shelf/comics drops its h1 when the API is down — backlog issue TBD
      test.fail(
        path === '/shelf/comics/' && !process.env.E2E_BASE_URL,
        'h1 missing without a backend',
      )
      const { response, errors } = await openRoute(path, theme)
      expect(response.status()).toBeLessThan(400)
      await expect(page.locator('h1').first()).toBeVisible()
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

// An unknown path may come back as 404 (or as the SPA shell, per host); what
// matters is that the NotFound page renders.
for (const theme of THEMES) {
  test(`unknown path renders NotFound (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    const { errors } = await openRoute(NOT_FOUND_PATH, theme)
    await expect(page.locator('h1').first()).toBeVisible()
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
