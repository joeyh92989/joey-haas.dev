import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests (smoke + accessibility) against the built site.
 *
 * Locally this serves frontend/dist with `vite preview`, so run
 * `VITE_DAILY_SALT=local npm run build` first. Set E2E_BASE_URL to test an
 * already-running site (a deploy preview, production) instead.
 */
const remote = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  testMatch: ['smoke.spec.js', 'a11y.spec.js'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: { baseURL: remote ?? 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
  webServer: remote
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
      },
})
