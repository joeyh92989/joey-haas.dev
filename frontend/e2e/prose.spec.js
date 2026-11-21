import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

// Prose pages (#531): no sideways scroll from a 320px phone to a 1440px
// desktop on any of them, and the Blog card's whole-card link draws a ring
// that is not clipped.

const note = readdirSync(resolve(import.meta.dirname, '../notes'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.replace(/\.md$/, ''))[0]

const ROUTES = [
  '/about',
  '/projects',
  '/now',
  '/colophon',
  '/blog',
  '/blog/how-my-shelf-works',
  '/til',
  ...(note ? [`/til/${note}`] : []),
]

for (const path of ROUTES) {
  for (const width of [320, 390, 1280, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`${path} does not scroll sideways at ${width}px (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await page.setViewportSize({ width, height: 900 })
        await openRoute(path, theme)
        await expect(page.locator('h1').first()).toBeVisible()
        const { scroll, inner, wide } = await page.evaluate(() => {
          const inner = window.innerWidth
          // A code block scrolls inside its own `pre`: what it holds may run
          // past the edge without widening the page.
          const clipped = (el) => {
            for (let up = el.parentElement; up; up = up.parentElement) {
              const x = getComputedStyle(up).overflowX
              if (x === 'auto' || x === 'scroll') return true
            }
            return false
          }
          const wide = [...document.querySelectorAll('body *')]
            .filter(
              (el) =>
                el.getBoundingClientRect().right > inner + 0.5 && !clipped(el),
            )
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
          return { scroll: document.documentElement.scrollWidth, inner, wide }
        })
        // Name the elements past the edge, so a failure points at the cause.
        expect(wide).toEqual([])
        expect(scroll).toBeLessThanOrEqual(inner)
      })
    }
  }
}

// A computed outline cannot show clipping (Home's Work card once cut off a
// ring drawn outside it). Compare pixels of a strip just inside the card's
// top edge, focused and not.
for (const theme of ['light', 'dark']) {
  test(`a focused Blog card paints a visible ring (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
    await openRoute('/blog', theme)
    const card = page.locator('main [data-slot="card"]').first()
    const link = card.getByRole('link')
    await page.mouse.move(0, 0)
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    const clip = {
      x: box.x + 24,
      y: box.y + 1,
      width: box.width - 48,
      height: 3,
    }
    const before = await page.screenshot({ clip })
    await link.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    const after = await page.screenshot({ clip })
    expect(Buffer.compare(before, after)).not.toBe(0)
  })
}

// A pixel diff, not a computed style: the first link on each page, with a
// margin around it for a ring drawn outside the box, focused and not.
test('prose page links paint a focus ring', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
  for (const path of ['/projects', '/about', '/blog']) {
    await openRoute(path, 'light')
    const target = page.locator('main a').first()
    await page.mouse.move(0, 0)
    await target.scrollIntoViewIfNeeded()
    const box = await target.boundingBox()
    const clip = {
      x: Math.max(box.x - 6, 0),
      y: Math.max(box.y - 6, 0),
      width: box.width + 12,
      height: box.height + 12,
    }
    const before = await page.screenshot({ clip })
    await target.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
    const after = await page.screenshot({ clip })
    expect(Buffer.compare(before, after), path).not.toBe(0)
  }
})
