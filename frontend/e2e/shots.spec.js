import { writeFileSync } from 'node:fs'
import { test } from './fixtures.js'
import { routePaths } from './routes.js'
import { shotsDir } from './shots-dir.js'

const THEMES = ['light', 'dark']
const samples = JSON.parse(process.env.E2E_SHOT_SAMPLES ?? '[]')
const paths = [...new Set([...routePaths(), ...samples])]

/** "/" -> "home"; "/shelf/year/2026/" -> "shelf_year_2026". */
const slug = (path) => path.split('/').filter(Boolean).join('_') || 'home'

/**
 * Native lazy images below the fold stay unloaded in a full-page capture:
 * make them eager and wait (up to `ms`) until every image has completed.
 */
async function loadAllImages(page, ms) {
  await page.evaluate(() => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) {
      img.loading = 'eager'
    }
  })
  await page.waitForFunction(
    () => [...document.images].every((img) => img.complete),
    undefined,
    { timeout: ms },
  )
}

// Screenshots never fail the run: page problems are recorded for review.
for (const theme of THEMES) {
  for (const path of paths) {
    test(`${theme} ${path}`, async ({ page, openRoute }, testInfo) => {
      const project = testInfo.project.name
      const found = []
      try {
        const { response, errors } = await openRoute(path, theme)
        if (response && !response.ok()) found.push(`HTTP ${response.status()}`)
        const deadline = Date.now() + 15_000
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => found.push('network not idle after 15 s'))
        await loadAllImages(page, Math.max(deadline - Date.now(), 1_000)).catch(
          () => found.push('images not loaded after 15 s'),
        )
        // Record page errors first, so a failed screenshot still has them.
        found.push(...errors)
        const seen = errors.length
        await page.screenshot({
          path: `${shotsDir}/${project}/${theme}/${slug(path)}.png`,
          fullPage: true,
          animations: 'disabled',
        })
        found.push(...errors.slice(seen))
      } catch (error) {
        found.push(`shot failed: ${error.message.split('\n')[0]}`)
      }
      if (found.length) {
        writeFileSync(
          `${shotsDir}/.errors/${project}-${theme}-${slug(path)}.json`,
          JSON.stringify({ project, theme, route: path, errors: found }),
        )
      }
    })
  }
}
