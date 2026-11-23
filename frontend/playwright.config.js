import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests (smoke + accessibility) against the built site.
 *
 * Locally this serves frontend/dist with `vite preview`, so run
 * `VITE_DAILY_SALT=local npm run build` first. Set E2E_BASE_URL to test an
 * already-running site (a deploy preview, production) instead.
 */
const remote = process.env.E2E_BASE_URL

// E2E_SKIP_FILES: comma-separated spec file names to leave out of this run.
function skipFiles() {
  return (process.env.E2E_SKIP_FILES ?? '')
    .split(',')
    .filter(Boolean)
    .map((name) => `**/${name}`)
}

export default defineConfig({
  testDir: './e2e',
  // CI splits the suite across jobs by file (ci.yml): the job that runs
  // "everything else" sets E2E_SKIP_FILES to the files other jobs own, so a
  // new spec file lands in it by default and is never silently dropped.
  testIgnore: skipFiles(),
  testMatch: [
    'smoke.spec.js',
    'a11y.spec.js',
    'dynamic.spec.js',
    'comics-shelf.spec.js',
    'verify.spec.js',
    'more-menu.spec.js',
    'home.spec.js',
    'prose.spec.js',
    'shelf-lists.spec.js',
    'detail.spec.js',
    'admin-shelf.spec.js',
    'tour-overflow.spec.js',
    'tools-data.spec.js',
    'admin-home.spec.js',
    'admin-add.spec.js',
  ],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: remote ?? 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
  webServer: remote
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        // Never reuse: --strictPort then fails loudly if something (another
        // worktree's preview) already holds :4173.
        reuseExistingServer: false,
      },
})
