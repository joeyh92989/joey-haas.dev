import { test as setup, expect } from '@playwright/test'

/** Signs in through the test-login route and saves the session cookie. */
setup('sign in as admin', async ({ page }) => {
  // Through the page origin (the vite preview proxy), so the cookie lands on
  // localhost:4173 and the request carries an allowed Origin or none.
  const response = await page.request.post('/api/auth/test-login')
  expect(response.status()).toBe(204)
  await page.context().storageState({ path: 'e2e/.auth/admin.json' })
})
