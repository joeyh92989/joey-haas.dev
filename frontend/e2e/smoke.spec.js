import { test, expect } from './fixtures.js'
import { API_BACKED, NOT_FOUND_PATH, routePaths } from './routes.js'

const THEMES = ['light', 'dark']

for (const path of routePaths()) {
  for (const theme of THEMES) {
    test(`${path} renders (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      const { response, errors } = await openRoute(path, theme)
      expect(response.status()).toBeLessThan(400)
      // API-backed pages show an error alert instead of an h1 when no backend
      // is running; against a real site (E2E_BASE_URL) the h1 is required.
      const heading =
        API_BACKED.has(path) && !process.env.E2E_BASE_URL
          ? page.locator('h1, main [role="alert"]')
          : page.locator('h1')
      await expect(heading.first()).toBeVisible()
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
