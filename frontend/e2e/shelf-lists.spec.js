import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'

// The public shelf lists (#532), against the fixture snapshot: no sideways
// scroll in either view, rings that are drawn and not clipped, axe in both
// themes, a long title on a spine, and the spine view's keyboard path.
test.skip(!!process.env.E2E_BASE_URL, 'fixture snapshot only')

const PAGES = ['/shelf/games', '/shelf/comics']
const VIEWS = [
  ['cards', ''],
  ['spines', '?view=spines'],
]
const THEMES = ['light', 'dark']

for (const path of PAGES) {
  for (const [view, query] of VIEWS) {
    for (const width of [320, 390, 1280, 1440]) {
      for (const theme of THEMES) {
        test(`${path} ${view} does not scroll sideways at ${width}px (${theme})`, async ({
          page,
          openRoute,
        }, testInfo) => {
          test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
          await page.setViewportSize({ width, height: 900 })
          await openRoute(path + query, theme)
          await expect(page.locator('h1').first()).toBeVisible()
          await expect(
            page
              .locator(view === 'spines' ? '.shelf-spine' : '.poster-card')
              .first(),
          ).toBeVisible()
          const { scroll, inner, wide } = await page.evaluate(() => {
            const inner = window.innerWidth
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
                  el.getBoundingClientRect().right > inner + 0.5 &&
                  !clipped(el),
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
}

for (const path of PAGES) {
  for (const [view, query] of VIEWS) {
    for (const theme of THEMES) {
      test(`${path} ${view} has no serious a11y violations (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
        await openRoute(path + query, theme)
        await expect(
          page
            .locator(view === 'spines' ? '.shelf-spine' : '.poster-card')
            .first(),
        ).toBeVisible()
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
        const serious = results.violations
          .filter((v) => ['serious', 'critical'].includes(v.impact))
          .map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(', ')}`,
          )
        expect(serious).toEqual([])
      })
    }
  }
}

// A computed outline cannot show clipping. Compare pixels of a strip just
// inside the card's top edge, focused and not (as the Blog card's test).
for (const path of PAGES) {
  for (const theme of THEMES) {
    test(`a focused ${path} card paints a visible inset ring (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
      await openRoute(path, theme)
      const card = page.locator('.poster-card').first()
      const link = card.getByRole('link').first()
      await page.mouse.move(0, 0)
      await card.scrollIntoViewIfNeeded()
      const box = await card.boundingBox()
      const clip = {
        x: box.x + 24,
        y: box.y + 1,
        width: Math.max(box.width - 48, 8),
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
}

// The spine's ring is drawn outside it: a margin around the spine, focused
// and not, shows it is painted and that nothing in the rail clips it.
for (const path of PAGES) {
  for (const theme of THEMES) {
    test(`a focused ${path} spine paints a visible ring that is not clipped (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
      await openRoute(`${path}?view=spines`, theme)
      const spine = page.locator('.shelf-spine').nth(1)
      await page.mouse.move(0, 0)
      await spine.scrollIntoViewIfNeeded()
      const box = await spine.boundingBox()
      // The two sides, the top and the corner: where a clipping ancestor
      // would cut the ring.
      const clips = [
        { x: box.x - 4, y: box.y + 20, width: 2, height: 40 },
        { x: box.x + box.width + 2, y: box.y + 20, width: 2, height: 40 },
        { x: box.x + 10, y: box.y - 4, width: 20, height: 2 },
      ]
      const before = await Promise.all(
        clips.map((clip) => page.screenshot({ clip })),
      )
      await spine.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(spine).toBeFocused()
      const after = await Promise.all(
        clips.map((clip) => page.screenshot({ clip })),
      )
      for (const [i, shot] of after.entries()) {
        expect(Buffer.compare(before[i], shot), `ring edge ${i}`).not.toBe(0)
      }
    })
  }
}

test('a long title wraps on its spine and is not clipped or wider than it', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
  const items = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, 'fixtures/snapshot/items.json'),
      'utf8',
    ),
  )
  const long =
    'The Extraordinarily Long and Winding Adventures of an Unreasonably Patient Hero in the Kingdom of Unbroken Sentences'
  const first = items.findIndex((item) => item.type === 'game')
  items[first] = { ...items[first], title: long }
  await page.route('**/snapshot/items.json', (route) =>
    route.fulfill({ json: items }),
  )
  for (const width of [320, 390, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openRoute('/shelf/games?view=spines', 'light')
    const spine = page.locator('.shelf-spine', { hasText: long }).first()
    await expect(spine).toBeVisible()
    const fit = await spine.evaluate((link) => {
      const title = [...link.querySelectorAll('span')].find((s) =>
        s.textContent.startsWith('The Extra'),
      )
      const a = link.getBoundingClientRect()
      const t = title.getBoundingClientRect()
      return {
        left: t.left - a.left,
        right: a.right - t.right,
        bottom: a.bottom - t.bottom,
        top: t.top - a.top,
        clipped: title.scrollHeight > title.clientHeight + 1,
        page: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(fit.left, `left @${width}`).toBeGreaterThanOrEqual(-0.5)
    expect(fit.right, `right @${width}`).toBeGreaterThanOrEqual(-0.5)
    expect(fit.bottom, `bottom @${width}`).toBeGreaterThanOrEqual(-0.5)
    expect(fit.clipped).toBe(false)
    expect(fit.page).toBeLessThanOrEqual(0)
    await expect(spine).toHaveAccessibleName(new RegExp(`^${long}`))
  }
})

test('the spines are reached in reading order by keyboard, each named by its title', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
  await openRoute('/shelf/games?view=spines', 'light')
  const spines = page.locator('.shelf-spine')
  await spines.nth(0).focus()
  await page.keyboard.press('Tab')
  await expect(spines.nth(1)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(spines.nth(2)).toBeFocused()
  await expect(spines.nth(2)).toHaveAccessibleName(
    /^Fixture Game 03\b.*Backlog/,
  )
})

test('the spine view is a choice in the URL and cards stay the default', async ({
  page,
  openRoute,
}) => {
  await openRoute('/shelf/comics', 'light')
  await expect(page.locator('.shelf-spine')).toHaveCount(0)
  await page.getByRole('button', { name: 'Spines' }).click()
  await expect(page).toHaveURL(/\?view=spines$/)
  expect(await page.locator('.shelf-spine').count()).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Cards' }).click()
  await expect(page).not.toHaveURL(/view=/)
  await expect(page.locator('.shelf-spine')).toHaveCount(0)
})

test('a spine does not lift under reduced motion', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pointer hover')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openRoute('/shelf/games?view=spines', 'light')
  const spine = page.locator('.shelf-spine').first()
  await spine.hover()
  await page.waitForTimeout(250)
  const transform = await spine.evaluate((el) => getComputedStyle(el).transform)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform)
})
