import { defineConfig, devices } from '@playwright/test'

/**
 * Visual baselines (#217): `npm run e2e:visual` compares full-page
 * screenshots with the PNGs in e2e/visual-baselines/. They are generated on
 * the CI runner only (the update-visual-baselines workflow); a Mac renders
 * text differently and will not match. Same build and server rule as the main
 * suite (CI copies the fixture snapshot in before building).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['visual.spec.js'],
  // One set of baselines, from ubuntu: no platform suffix in the name.
  snapshotPathTemplate: '{testDir}/visual-baselines/{projectName}/{arg}{ext}',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-visual' }],
  ],
  outputDir: 'test-results-visual',
  use: {
    baseURL: 'http://localhost:4173',
    reducedMotion: 'reduce',
    trace: 'off',
  },
  expect: { toHaveScreenshot: { maxDiffPixels: 0 } },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    // Pixel 5 is 393 wide.
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
})
