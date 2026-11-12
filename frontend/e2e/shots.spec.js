import { writeFileSync } from 'node:fs'
import { test } from './fixtures.js'
import { routePaths } from './routes.js'

const THEMES = ['light', 'dark']
const samples = JSON.parse(process.env.E2E_SHOT_SAMPLES ?? '[]')
const paths = [...new Set([...routePaths(), ...samples])]

/** "/" -> "home"; "/shelf/year/2026/" -> "shelf_year_2026". */
const slug = (path) => path.split('/').filter(Boolean).join('_') || 'home'

// Screenshots never fail the run: page problems are recorded for review.
for (const theme of THEMES) {
  for (const path of paths) {
    test(`${theme} ${path}`, async ({ page, openRoute }, testInfo) => {
      const project = testInfo.project.name
      const found = []
      try {
        const { response, errors } = await openRoute(path, theme)
        if (response && !response.ok()) found.push(`HTTP ${response.status()}`)
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => found.push('network not idle after 15 s'))
        await page.screenshot({
          path: `e2e-shots/${project}/${theme}/${slug(path)}.png`,
          fullPage: true,
          animations: 'disabled',
        })
        found.push(...errors)
      } catch (error) {
        found.push(`shot failed: ${error.message.split('\n')[0]}`)
      }
      if (found.length) {
        writeFileSync(
          `e2e-shots/.errors/${project}-${theme}-${slug(path)}.json`,
          JSON.stringify({ project, theme, route: path, errors: found }),
        )
      }
    })
  }
}
