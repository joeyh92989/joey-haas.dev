import { defineConfig, devices } from '@playwright/test'

// Local run of the admin data spec against a built preview, no backend: the
// spec routes the session and the API in the page. E2E_PREVIEW_PORT moves it.
const PORT = process.env.E2E_PREVIEW_PORT ?? '4180'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['admin-data.spec.js'],
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
})
