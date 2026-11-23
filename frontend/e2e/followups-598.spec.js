import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { serve } from './tools-data.fixtures.js'

// The small fixes from #598, measured in a browser: the accent ring on a link
// with none of its own, the replay mark on a dimmed card, the 44px page links
// with a centred label, a hovered cover tile, and the code face. Desktop
// project only: the viewport is set here. Fixture snapshot only.
test.skip(!!process.env.E2E_BASE_URL, 'fixture snapshot only')
test.beforeEach((_fixtures, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
})

const THEMES = ['light', 'dark']
const BOTH = '55555555-bbbb-4bbb-8bbb-000000000005'
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/api/${name}`, import.meta.url), 'utf8')
const ITEMS = JSON.parse(
  readFileSync(
    new URL('./fixtures/snapshot/items.json', import.meta.url),
    'utf8',
  ),
)

for (const theme of THEMES) {
  test(`a link with no ring of its own is ringed in the accent (${theme})`, async ({
    page,
    openRoute,
  }) => {
    for (const [path, selector] of [
      ['/about', '.prose a'],
      ['/blog/how-my-shelf-works', '.post-body a'],
      ['/colophon', '.prose a'],
    ]) {
      await openRoute(path, theme)
      const link = page.locator(selector).first()
      await expect(link).toBeVisible()
      await page.keyboard.press('Tab')
      await link.focus({ focusVisible: true })
      const ring = await link.evaluate((a) => {
        const cs = getComputedStyle(a)
        const accent = getComputedStyle(document.documentElement)
          .getPropertyValue('--accent')
          .trim()
        const probe = document.createElement('i')
        probe.style.color = accent
        document.body.append(probe)
        const want = getComputedStyle(probe).color
        probe.remove()
        return {
          style: cs.outlineStyle,
          width: cs.outlineWidth,
          offset: cs.outlineOffset,
          color: cs.outlineColor,
          want,
        }
      })
      expect(ring, `${path} ${selector}`).toMatchObject({
        style: 'solid',
        width: '2px',
        offset: '2px',
      })
      expect(ring.color, `${path} ${selector}`).toBe(ring.want)
    }
  })

  test(`a finished card dimmed keeps the replay mark's contrast (${theme})`, async ({
    page,
    openRoute,
  }) => {
    await page.route('**/snapshot/items.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          ITEMS.map((item) =>
            item.status === 'finished' ? { ...item, times_completed: 3 } : item,
          ),
        ),
      }),
    )
    await page.addInitScript(() =>
      localStorage.setItem('shelf.public.dim', 'true'),
    )
    await openRoute('/shelf/games', theme)
    const card = page.locator('.poster-card[data-dimmed]').first()
    await expect(card.locator('.replay-mark')).toBeVisible()
    // Only the cover fades; its marks and text keep full strength.
    await expect(card.locator('.cover').first()).toHaveCSS('opacity', '0.45')
    await expect(card.locator('.poster-art')).toHaveCSS('opacity', '1')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .include('.poster-card[data-dimmed]')
      .analyze()
    expect(results.violations.map((v) => `${v.id} ${v.nodes.length}`)).toEqual(
      [],
    )
  })
}

test('What’s next’s phone jump links are 44px with the label centred', async ({
  page,
  openRoute,
}) => {
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 800 })
    await serve(page, ['next', 'pick-for-me'])
    await openRoute('/shelf/next')
    const links = page.locator('.jump-nav a')
    await expect(links.first()).toBeVisible()
    const boxes = await links.evaluateAll((list) =>
      list.map((a) => {
        const box = a.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(a)
        const text = range.getBoundingClientRect()
        return {
          height: box.height,
          gap: Math.abs(text.top - box.top - (box.bottom - text.bottom)),
        }
      }),
    )
    for (const { height, gap } of boxes) {
      expect(height).toBeGreaterThanOrEqual(44)
      // Equal space above and below the words, to a pixel.
      expect(gap).toBeLessThanOrEqual(1)
    }
  }
})

test('a hovered cover tile link is not underlined', async ({
  page,
  openRoute,
}) => {
  await page.route(`**/api/public/items/${BOTH}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: fixture('public-comic-both.json'),
    }),
  )
  await page.route(`**/api/public/items/${BOTH}/issues`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: fixture('public-comic-wall-both.json'),
    }),
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await openRoute(`/shelf/${BOTH}`)
  const tile = page.locator('a.cover-tile').first()
  await expect(tile).toBeVisible()
  await tile.hover()
  await expect(tile).toHaveCSS('text-decoration-line', 'none')
})

test('code is set in the site mono face on a post and on the Tour', async ({
  page,
  openRoute,
}) => {
  await openRoute('/blog/how-my-shelf-works')
  const post = page.locator('.post-body pre code').first()
  await expect(post).toBeVisible()
  expect(await post.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
    /^"?JetBrains Mono/,
  )
  const inline = page.locator('.post-body p code').first()
  expect(
    await inline.evaluate((el) => getComputedStyle(el).fontFamily),
  ).toMatch(/^"?JetBrains Mono/)
  await openRoute('/shelf/how')
  const tour = page.locator('.tour-code code').first()
  await expect(tour).toBeVisible()
  expect(await tour.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
    /^"?JetBrains Mono/,
  )
})
