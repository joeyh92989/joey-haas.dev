// Slice E1's scenarios for style-dump.mjs (#536): the shared chip, result,
// disclosure and attribution rules. The base dump already shows every page
// that draws one; these add the states it does not reach: a pressed chip
// hovered, a chip hovered on a touch screen (where the old `:hover` rule
// applied and Tailwind's `hover:` does not), a chip tabbed to, the Show more
// pager, the capped list's toggle, the Closet's Bike chip pressed, the comic
// series page's wall chips and Pick for me's chips. A scenario whose element
// the page does not draw logs `absent: <selector>` and is dumped as it stands,
// the same on both sides.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BOTH = '55555555-bbbb-4bbb-8bbb-000000000005'
const API = resolve(import.meta.dirname, '../../fixtures/api')
const fixture = (name) => readFileSync(resolve(API, name), 'utf8')

/**
 * @param {{record: Function, click: Function}} tools style-dump's own helpers.
 * @param {string} theme
 * @param {string} vp
 */
export async function e1({ record }, theme, vp) {
  const at = (name) => `screen ${theme} ${vp} e1 ${name}`
  const spec = (path, kind, touch) => ({ path, theme, vp, kind, touch })
  // The comic with issues and books: its wall's answers routed, then reloaded.
  const wall = (inner) => async (page) => {
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
    await page.reload()
    await page.locator('h1, h2').first().waitFor({ timeout: 15000 })
    await inner(page)
  }
  const settle = async (page) => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
  }
  // Hover (or tab to) the nth match, logging when the page draws none.
  const on =
    (selector, action, n = 0, label = '') =>
    async (page) => {
      await settle(page)
      const target = page.locator(selector).nth(n)
      if (!(await target.count())) {
        console.error(`absent: ${selector} (${label})`)
        return
      }
      if (action === 'hover') await target.hover()
      if (action === 'focus') {
        await page.keyboard.press('Tab')
        await target.focus()
      }
      if (action === 'press') await target.click()
      if (action === 'press-hover') {
        await target.click()
        await target.hover()
      }
      await page.waitForTimeout(300)
    }

  for (const touch of [false, true]) {
    const mode = touch ? 'touch ' : ''
    const games = spec('/shelf/games', undefined, touch)
    await record(
      at(`${mode}games toolbar chip hover`),
      games,
      on(
        '.shelf-toolbar .chip[aria-pressed="false"]',
        'hover',
        0,
        at(`${mode}games toolbar chip hover`),
      ),
    )
    await record(
      at(`${mode}games filter chip pressed hover`),
      games,
      on(
        '.chip-rows .chip[aria-pressed="false"]',
        'press-hover',
        0,
        at(`${mode}games filter chip pressed hover`),
      ),
    )
    await record(
      at(`${mode}games direction chip hover`),
      games,
      on(
        '.sort-direction',
        'hover',
        0,
        at(`${mode}games direction chip hover`),
      ),
    )
    await record(
      at(`${mode}games pager chip hover`),
      games,
      on('.pager .chip', 'hover', 0, at(`${mode}games pager chip hover`)),
    )
    await record(
      at(`${mode}comics pager chip hover`),
      spec('/shelf/comics', undefined, touch),
      on('.pager .chip', 'hover', 0, at(`${mode}comics pager chip hover`)),
    )
    await record(
      at(`${mode}play next chip hover`),
      spec('/admin/play-next', 'play-next', touch),
      on(
        '.chip[aria-pressed="false"]',
        'hover',
        0,
        at(`${mode}play next chip hover`),
      ),
    )
    await record(
      at(`${mode}play next chip pressed hover`),
      spec('/admin/play-next', 'play-next', touch),
      on(
        '.chip[aria-pressed="false"]',
        'press-hover',
        0,
        at(`${mode}play next chip pressed hover`),
      ),
    )
    await record(
      at(`${mode}closet today bike pressed hover`),
      spec('/admin/closet/today', 'closet', touch),
      on(
        '.chip.chip-modifier',
        'press-hover',
        0,
        at(`${mode}closet today bike pressed hover`),
      ),
    )
    await record(
      at(`${mode}admin games chip hover`),
      spec('/admin/shelf/games', 'shelf', touch),
      on(
        '.shelf-toolbar .chip[aria-pressed="false"]',
        'hover',
        1,
        at(`${mode}admin games chip hover`),
      ),
    )
    await record(
      at(`${mode}series wall chip hover`),
      spec(`/shelf/${BOTH}/`, undefined, touch),
      wall(
        on(
          '.chip-row[aria-labelledby="wall-show"] .chip',
          'hover',
          1,
          at(`${mode}series wall chip hover`),
        ),
      ),
    )
    await record(
      at(`${mode}next capped toggle hover`),
      spec('/shelf/next', 'next', touch),
      on('.capped-toggle', 'hover', 0, at(`${mode}next capped toggle hover`)),
    )
  }
  // Keyboard: the ring on each kind of chip.
  await record(
    at('games pager chip focus'),
    spec('/shelf/games'),
    on('.pager .chip', 'focus', 0, at('games pager chip focus')),
  )
  await record(
    at('games direction chip focus'),
    spec('/shelf/games'),
    on('.sort-direction', 'focus', 0, at('games direction chip focus')),
  )
  await record(
    at('games disclosure focus'),
    spec('/shelf/games'),
    on('.disclosure', 'focus', 0, at('games disclosure focus')),
  )
  await record(
    at('play next chip focus'),
    spec('/admin/play-next', 'play-next'),
    on('.chip', 'focus', 0, at('play next chip focus')),
  )
  await record(
    at('series wall chip focus'),
    spec(`/shelf/${BOTH}/`),
    wall(
      on(
        '.chip-row[aria-labelledby="wall-show"] .chip',
        'focus',
        1,
        at('series wall chip focus'),
      ),
    ),
  )
  await record(
    at('next capped toggle focus'),
    spec('/shelf/next', 'next'),
    on('.capped-toggle', 'focus', 0, at('next capped toggle focus')),
  )
  await record(
    at('next capped toggle open'),
    spec('/shelf/next', 'next'),
    on('.capped-toggle', 'press', 0, at('next capped toggle open')),
  )
  await record(
    at('comics spines pressed'),
    spec('/shelf/comics'),
    on(
      '.chip-row .chip[aria-pressed="false"]',
      'press',
      0,
      at('comics spines pressed'),
    ),
  )
  // The disclosure: open, and the footers on the shelves that carry one.
  await record(
    at('games disclosure open hover'),
    spec('/shelf/games'),
    on('.disclosure', 'press-hover', 0, at('games disclosure open hover')),
  )
  await record(
    at('games disclosure touch hover'),
    spec('/shelf/games', undefined, true),
    on('.disclosure', 'press-hover', 0, at('games disclosure touch hover')),
  )
  await record(
    at('footer link focus'),
    spec('/shelf/comics'),
    on('.attribution a', 'focus', 0, at('footer link focus')),
  )
  await record(
    at('footer link hover'),
    spec('/shelf/next', 'next'),
    on('.attribution a', 'hover', 0, at('footer link hover')),
  )
  await record(
    at('discover genres'),
    spec('/admin/discover', 'add'),
    on('.chip-list li', 'hover', 0, at('discover genres')),
  )
}
