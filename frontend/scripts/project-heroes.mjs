/* global document, window */
// Project card hero images: shoots two public pages in both themes and writes
// WebP files to public/projects/. See scripts/README.md.
import { mkdirSync, statSync } from 'node:fs'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const BASE = process.env.E2E_BASE_URL ?? 'https://joey-haas.dev'
const OUT = new URL('../public/projects/', import.meta.url)
const WIDTH = 1200
const HEIGHT = 560
const MAX_BYTES = 80 * 1024

// Public pages only: nothing here needs a session.
const SHOTS = [
  { slug: 'my-shelf', path: '/shelf/games/', scroll: 345 },
  { slug: 'this-site', path: '/' },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 600 },
    })
    await context.addInitScript((value) => {
      localStorage.setItem('theme', value)
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        value: true,
        configurable: true,
      })
    }, theme)
    await context.route('**/api/track', (route) => route.abort())
    for (const { slug, path, scroll = 0 } of SHOTS) {
      const page = await context.newPage()
      await page.goto(new URL(path, BASE).href, { waitUntil: 'networkidle' })
      await page.evaluate(() => {
        for (const img of document.querySelectorAll('img[loading="lazy"]')) {
          img.loading = 'eager'
        }
      })
      await page.evaluate((y) => window.scrollTo(0, y), scroll)
      await page.waitForTimeout(1500)
      const png = await page.screenshot({ animations: 'disabled' })
      let quality = 78
      let webp
      do {
        webp = await sharp(png)
          .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'top' })
          .webp({ quality, effort: 6 })
          .toBuffer()
        quality -= 6
      } while (webp.length > MAX_BYTES && quality > 30)
      const file = new URL(`${slug}-${theme}.webp`, OUT)
      await sharp(webp).toFile(file.pathname)
      console.log(`${slug}-${theme}.webp ${statSync(file).size} bytes`)
      await page.close()
    }
    await context.close()
  }
} finally {
  await browser.close()
}
