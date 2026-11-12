import { test as base, expect } from '@playwright/test'

/** A console error caused by the missing backend, which is expected. */
function isApiNoise(message) {
  const url = message.location().url
  return /\/api\//.test(url) || /\/api\//.test(message.text())
}

/**
 * `test` with `openRoute(path, theme)`: opens a page with the theme preset,
 * analytics opted out and /api/track blocked, then resolves to
 * `{ response, errors }`. `errors` collects uncaught exceptions and console
 * errors, minus failed /api/ requests (there is no backend in these runs).
 */
export const test = base.extend({
  openRoute: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error' || isApiNoise(message)) return
      errors.push(`console: ${message.text()}`)
    })
    await page.route('**/api/track', (route) => route.abort())

    await use(async (path, theme = 'light') => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value)
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          value: true,
          configurable: true,
        })
      }, theme)
      const response = await page.goto(path)
      return { response, errors }
    })
  },
})

export { expect }
