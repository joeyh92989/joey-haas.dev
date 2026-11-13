import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'
import { sampleRoutes } from './e2e/sitemap-sample.js'

/**
 * Full-page screenshots of every public route x width x theme, for design
 * reviews: `npm run shots`. Same projects and server rule as the main suite.
 * Set E2E_BASE_URL (e.g. https://joey-haas.dev) to shoot an existing site.
 * Output: e2e-shots/<project>/<theme>/<route>.png plus e2e-shots/errors.json.
 */
const remote = process.env.E2E_BASE_URL

// The route list is resolved here, before any test is declared, and handed to
// the spec (and workers) through the environment.
if (remote && process.env.E2E_SHOT_SAMPLES === undefined) {
  let samples = []
  try {
    const response = await fetch(new URL('/sitemap.xml', remote))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    samples = sampleRoutes(await response.text())
  } catch (error) {
    console.warn(
      `shots: sitemap unavailable (${error.message}); static routes only`,
    )
  }
  console.log(`shots: sampled routes: ${samples.join(' ') || '(none)'}`)
  process.env.E2E_SHOT_SAMPLES = JSON.stringify(samples)
}

export default defineConfig({
  ...base,
  testMatch: 'shots.spec.js',
  forbidOnly: false,
  retries: 0,
  fullyParallel: true,
  workers: remote ? 4 : undefined,
  reporter: [['list']],
  globalSetup: './e2e/shots-setup.js',
  globalTeardown: './e2e/shots-teardown.js',
  timeout: 90_000,
})
