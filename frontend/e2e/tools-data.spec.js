import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures.js'
import { serve } from './tools-data.fixtures.js'

// The tools and data pages (#534): Stats, Denver, the Daily game and Pick for
// me. No sideways scroll from 320px to 1440px (naming the element that
// overflows), a focus ring that paints on the chips and radios (compared by
// pixels, since a computed outline cannot show clipping), and axe on each
// page in the state it is used in.

const GAMES = JSON.parse(
  readFileSync(
    new URL('./fixtures/snapshot/items.json', import.meta.url),
    'utf8',
  ),
)
  .filter((item) => item.type === 'game')
  .map((item) => item.title)

/** Plays the Daily game to its end (a win or six misses) from the fixture titles. */
async function playOut(page) {
  const box = page.getByRole('combobox', { name: 'Your guess' })
  for (const title of GAMES.slice(1, 14)) {
    if (await page.locator('.daily-result').count()) return
    await box.fill(title)
    await box.press('Enter')
  }
  await expect(page.locator('.daily-result')).toBeVisible()
}

const PAGES = [
  {
    name: 'stats',
    path: '/stats',
    serve: ['site-stats'],
    ready: (page) =>
      expect(
        page.getByRole('heading', { name: 'Views per day' }),
      ).toBeVisible(),
  },
  {
    name: 'denver',
    path: '/denver',
    serve: ['spots'],
    ready: (page) => expect(page.locator('.spot-card').first()).toBeVisible(),
  },
  {
    name: 'daily',
    path: '/daily',
    serve: [],
    ready: (page) =>
      expect(page.getByRole('combobox', { name: 'Your guess' })).toBeVisible(),
  },
  {
    name: 'daily, finished',
    path: '/daily',
    serve: [],
    ready: async (page) => {
      await expect(
        page.getByRole('combobox', { name: 'Your guess' }),
      ).toBeVisible()
      await playOut(page)
    },
  },
  {
    name: 'pick for me',
    path: '/shelf/next',
    serve: ['next', 'pick-for-me'],
    ready: async (page) => {
      await expect(page.locator('#pick-for-me')).toBeVisible()
      await page
        .getByRole('radio', { name: /Any length/ })
        .check({ force: true })
      await page.getByRole('button', { name: 'Cozy' }).click()
      await expect(page.locator('.pick-cards > li').first()).toBeVisible()
    },
  },
]

for (const spec of PAGES) {
  for (const width of [320, 390, 1280, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`${spec.name} does not scroll sideways at ${width}px (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await page.setViewportSize({ width, height: 900 })
        await serve(page, spec.serve)
        await openRoute(spec.path, theme)
        await spec.ready(page)
        const found = await page.evaluate(() => {
          const inner = window.innerWidth
          const name = (el) =>
            el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : '') +
            (typeof el.className === 'string' && el.className
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
              : '')
          const wide = [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > inner + 0.5)
            // An element inside a scroller is allowed to be wider than it.
            .filter((el) => {
              for (let p = el.parentElement; p; p = p.parentElement) {
                const overflow = getComputedStyle(p).overflowX
                if (overflow === 'auto' || overflow === 'scroll') return false
              }
              return true
            })
            .slice(0, 5)
            .map(name)
          return {
            scroll: document.documentElement.scrollWidth,
            inner,
            wide,
          }
        })
        expect(found.wide, 'elements past the right edge').toEqual([])
        expect(found.scroll).toBeLessThanOrEqual(found.inner)
      })
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`${spec.name} has no serious axe violations (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await serve(page, spec.serve)
      await openRoute(spec.path, theme)
      await spec.ready(page)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact),
      )
      expect(
        serious.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`),
      ).toEqual([])
    })
  }
}

/**
 * Whether focusing `target` by keyboard changes any pixel in a box 6px wider
 * than it on every side: an outline drawn outside an element, or an inset one,
 * shows in that strip; one clipped away does not.
 */
async function ringPaints(page, target) {
  await page.mouse.move(0, 0)
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  const clip = {
    x: Math.max(0, box.x - 6),
    y: Math.max(0, box.y - 6),
    width: box.width + 12,
    height: box.height + 12,
  }
  const before = await page.screenshot({ clip })
  await target.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
  const after = await page.screenshot({ clip })
  return Buffer.compare(before, after) !== 0
}

for (const theme of ['light', 'dark']) {
  test(`Denver chips and spot names paint a focus ring (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
    await serve(page, ['spots'])
    await openRoute('/denver', theme)
    await expect(page.locator('.spot-card').first()).toBeVisible()
    const chip = page.locator('.denver-chips button').nth(1)
    expect(await ringPaints(page, chip)).toBe(true)
    const name = page.locator('.spot-card-name button').first()
    expect(await ringPaints(page, name)).toBe(true)
  })

  test(`Pick for me chips and length radios paint a focus ring (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
    await serve(page, ['next', 'pick-for-me'])
    await openRoute('/shelf/next', theme)
    await expect(page.locator('#pick-for-me')).toBeVisible()
    const mood = page.getByRole('button', { name: 'Cozy' })
    expect(await ringPaints(page, mood)).toBe(true)
    // The radio itself is visually hidden: its label draws the ring.
    const label = page.locator('.pick-radio').first()
    await page.mouse.move(0, 0)
    await label.scrollIntoViewIfNeeded()
    const box = await label.boundingBox()
    const clip = {
      x: box.x - 6,
      y: box.y - 6,
      width: box.width + 12,
      height: box.height + 12,
    }
    const before = await page.screenshot({ clip })
    const input = page.locator('.pick-radio input').first()
    await input.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    const after = await page.screenshot({ clip })
    expect(Buffer.compare(before, after)).not.toBe(0)
  })
}

// Review items on the Daily board, Stats and the Card's 14px (#534).
for (const width of [320, 1280]) {
  test(`Daily: no header clipped, body at 16px, the open guess list inside its card at ${width}px`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width, height: 900 })
    await openRoute('/daily', 'light')
    const box = page.getByRole('combobox', { name: 'Your guess' })
    await expect(box).toBeVisible()

    // Every visible header word fits its column, and is not a truncated word.
    const heads = await page.locator('.shelfle th').evaluateAll((ths) =>
      ths.map((th) => {
        const shown = [...th.querySelectorAll('.kicker')].find(
          (el) => el.getBoundingClientRect().width > 2,
        )
        return {
          text: shown.textContent,
          fits: shown.scrollWidth <= shown.clientWidth + 1,
          inside: th.scrollWidth <= th.clientWidth + 1,
          name: th.textContent,
        }
      }),
    )
    for (const head of heads) {
      expect(head.fits, head.text).toBe(true)
      expect(head.inside, head.text).toBe(true)
    }
    expect(heads.map((h) => h.text)).toEqual(
      width <= 384
        ? ['Guess', 'Plat.', 'Year', 'Genre', 'Size']
        : ['Guess', 'Platform', 'Year', 'Genre', 'Size'],
    )

    // A Card is 14px; the Daily card says 16px.
    const size = await page
      .locator('.daily-status')
      .evaluate((el) => getComputedStyle(el).fontSize)
    expect(size).toBe('16px')

    // The suggestion list at its cap stays inside the card.
    await box.fill('Fixture')
    const list = page.locator('.guess-list')
    await expect(list.getByRole('option')).toHaveCount(6)
    const edges = await page.evaluate(() => {
      const list = document.querySelector('.guess-list').getBoundingClientRect()
      const card = document.querySelector('.daily-card').getBoundingClientRect()
      return { listBottom: list.bottom, cardBottom: card.bottom }
    })
    expect(edges.listBottom).toBeLessThanOrEqual(edges.cardBottom)
  })

  test(`Stats: changelog text is 16px and the day chart is not clipped at ${width}px`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width, height: 900 })
    await serve(page, ['site-stats'])
    await openRoute('/stats', 'light')
    await expect(page.locator('.day-bars')).toBeVisible()
    const clip = await page.locator('.site-stats-days').evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }))
    expect(clip.scroll).toBeLessThanOrEqual(clip.client)
    const size = await page
      .locator('.changelog li li')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)
    expect(size).toBe('16px')
  })
}
