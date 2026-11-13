import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'
import { e2eBackendBin, E2E_DB_URL } from './e2e/admin-env.js'

/**
 * Local admin suite (#205): signs in as admin against a real backend on an
 * empty `joeyhaas_e2e` database. Run it through `npm run e2e:admin`, which
 * prepares the database first. Needs a build (`VITE_DAILY_SALT=local npm run
 * build`) and the backend venv (E2E_BACKEND_BIN overrides its bin directory).
 */
const AUTH_FILE = 'e2e/.auth/admin.json'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['admin.setup.js', 'admin.spec.js'],
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-admin' }],
  ],
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: 'admin.setup.js' },
    {
      name: 'desktop',
      testMatch: 'admin.spec.js',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
    {
      name: 'phone',
      testMatch: 'admin.spec.js',
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'], storageState: AUTH_FILE },
    },
  ],
  webServer: [
    {
      command: `${e2eBackendBin()}/uvicorn main:app --port 8000`,
      cwd: '../backend',
      // The same URL the app proxies; also fails clearly on a busy :8000
      // (a dev backend would not have E2E_TEST_LOGIN).
      url: 'http://localhost:8000/api/public/status',
      reuseExistingServer: false,
      env: {
        GOOGLE_CLIENT_ID: 'e2e-client-id',
        GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
        SESSION_SECRET: randomBytes(32).toString('hex'),
        ADMIN_EMAIL: 'admin@example.com',
        FRONTEND_URL: 'http://localhost:4173',
        DATABASE_URL: E2E_DB_URL,
        DATABASE_URL_DIRECT: E2E_DB_URL,
        E2E_TEST_LOGIN: '1',
      },
    },
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
    },
  ],
})
